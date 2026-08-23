import type { DeploymentStatus, DeploymentStatusEvent, DeploymentTargetStatusEvent, GitProvider } from '@zyno-io/dag-shared';

import { ScopedLogger } from '@zyno-io/ts-server-foundation';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { ChartService } from './chart.service';
import { IacRepoService } from './iac-repo.service';
import { K8sMonitorService, PreDeploySnapshot } from './k8s-monitor.service';

export function buildJobUrl(provider: GitProvider, repoUrl: string, jobId: string): string {
    const base = repoUrl.replace(/\.git\/?$/i, '').replace(/\/+$/, '');
    if (provider === 'gitlab') return `${base}/-/jobs/${jobId}`;
    return `${base}/actions/runs/${jobId}`;
}

export function buildCommitUrl(repoUrl: string, sha: string): string | undefined {
    const base = repoUrl.replace(/\.git\/?$/i, '').replace(/\/+$/, '');
    try {
        const url = new URL(base);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
        if (url.hostname.includes('gitlab')) {
            return `${base}/-/commit/${sha}`;
        }
        return `${base}/commit/${sha}`;
    } catch {
        return undefined;
    }
}

export type DeploymentEvent = DeploymentStatusEvent | DeploymentTargetStatusEvent;

const deploymentEmitter = new EventEmitter();

export function getDeploymentChannel(deploymentId: string) {
    return {
        publish(data: DeploymentEvent) {
            deploymentEmitter.emit(deploymentId, data);
        },
        subscribe(fn: (data: DeploymentEvent) => void) {
            deploymentEmitter.on(deploymentId, fn);
            return () => {
                deploymentEmitter.off(deploymentId, fn);
            };
        }
    };
}

interface TargetMonitoringResult {
    target: DeploymentTargetEntity;
    succeeded: boolean;
}

export class DeploymentService {
    constructor(
        private iacRepoService: IacRepoService,
        private chartService: ChartService,
        private k8sMonitorService: K8sMonitorService,
        private logger: ScopedLogger
    ) {}

    async processDeployment(deploymentId: string, chartBuffer: Buffer, ciCommitSha: string): Promise<void> {
        const deployment = await DeploymentEntity.query().filterField('id', deploymentId).findOne();
        let commitUrl: string | undefined;

        try {
            const appEnvironment = await AppEnvironmentEntity.query().filterField('id', deployment.appEnvironmentId).findOne();
            const app = await AppEntity.query().filterField('id', appEnvironment.appId).findOne();
            const iac = await IacEntity.query().filterField('id', appEnvironment.iacId).findOne();
            const targets = await DeploymentTargetEntity.query().filterField('deploymentId', deployment.id).find();
            if (!targets.length) {
                throw new Error('Deployment has no configured cluster targets');
            }

            const clusterIds = [...new Set(targets.map(target => target.clusterId))];
            const clusters = await ClusterEntity.query()
                .filter({ id: { $in: clusterIds } })
                .find();
            const clustersById = new Map(clusters.map(cluster => [cluster.id, cluster]));
            for (const target of targets) {
                if (!clustersById.has(target.clusterId)) {
                    throw new Error(`Cluster ${target.clusterId} for target ${target.clusterName} no longer exists`);
                }
            }

            // Step 1: Validate job token
            await this.updateStatus(deployment, 'validating', `Verifying job token with ${app.gitProvider}...`);

            // Step 2: Capture every pre-deploy state in parallel, then push the chart once.
            const snapshots = await Promise.all(
                targets.map(async target => {
                    const cluster = clustersById.get(target.clusterId)!;
                    const snapshot = await this.k8sMonitorService.capturePreDeployState(cluster, target);
                    return [target.id, snapshot] as const;
                })
            );
            const snapshotsByTargetId = new Map<string, PreDeploySnapshot | null>(snapshots);
            await this.updateStatus(deployment, 'pushing', 'Pushing chart to IAC repo...');

            const commitSha = await this.iacRepoService.withRepoLock(iac, appEnvironment.iacBranch, async localPath => {
                await this.iacRepoService.extractChart(localPath, appEnvironment.iacPath, chartBuffer);
                await this.chartService.updateChartVersion(path.join(localPath, appEnvironment.iacPath), deployment.version);
                return this.iacRepoService.commitAndPush(
                    localPath,
                    iac,
                    `[${app.repoUrl.split('/').pop()}] deploy ${deployment.version}\n\nRepo: ${app.repoUrl}\nBranch: ${appEnvironment.branch}\nEnvironment: ${appEnvironment.name}\nCommit: ${ciCommitSha}\nJob: ${buildJobUrl(app.gitProvider, app.repoUrl, deployment.ciJobId)}\nIaC Target: ${appEnvironment.iacPath}`,
                    appEnvironment.iacBranch
                );
            });

            deployment.commitSha = commitSha;
            commitUrl = buildCommitUrl(iac.repoUrl, commitSha);
            await this.updateStatus(deployment, 'pushed', `Chart pushed to IAC repo (${commitSha.substring(0, 8)})`, commitUrl);

            // Step 3: All target monitors start together. A failure is recorded on that target,
            // but we deliberately wait for every target so the final record is complete.
            await this.updateStatus(
                deployment,
                'monitoring',
                `Monitoring ${targets.length} cluster target${targets.length === 1 ? '' : 's'}...`,
                commitUrl
            );
            const results = await Promise.all(
                targets.map(target => {
                    const cluster = clustersById.get(target.clusterId)!;
                    const snapshot = snapshotsByTargetId.get(target.id);
                    return this.monitorTarget(deployment, target, cluster, snapshot);
                })
            );

            const failedTargets = results.filter(result => !result.succeeded);
            if (failedTargets.length) {
                const failures = failedTargets.map(result => `${result.target.clusterName}: ${result.target.statusMessage ?? 'monitoring failed'}`);
                const message = `${failedTargets.length} of ${targets.length} cluster target${targets.length === 1 ? '' : 's'} failed: ${failures.join('; ')}`;
                await this.updateStatus(deployment, 'failed', message, commitUrl);
                throw new Error(message);
            }

            await this.updateStatus(
                deployment,
                'deployed',
                `Deployment completed successfully on all ${targets.length} cluster target${targets.length === 1 ? '' : 's'}`,
                commitUrl
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Deployment ${deploymentId} failed:`, err);
            await this.markUnfinishedTargetsFailed(deployment.id, message);
            if (deployment.status !== 'failed') {
                await this.updateStatus(deployment, 'failed', message, commitUrl);
            }
            throw err;
        }
    }

    private async monitorTarget(
        deployment: DeploymentEntity,
        target: DeploymentTargetEntity,
        cluster: ClusterEntity,
        preDeploySnapshot: PreDeploySnapshot | null | undefined
    ): Promise<TargetMonitoringResult> {
        await this.updateTargetStatus(target, 'monitoring', `Watching deployment on ${target.clusterName}...`);
        try {
            await this.k8sMonitorService.watchDeployment(
                cluster,
                target,
                {
                    onStatusChange: async message => {
                        await this.publishTargetStatus(target, 'monitoring', message);
                    }
                },
                preDeploySnapshot
            );
            await this.updateTargetStatus(target, 'deployed', `Deployment succeeded on ${target.clusterName}`);
            return { target, succeeded: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Deployment ${deployment.id} target ${target.clusterName} failed:`, err);
            await this.updateTargetStatus(target, 'failed', message);
            return { target, succeeded: false };
        }
    }

    private async markUnfinishedTargetsFailed(deploymentId: string, message: string): Promise<void> {
        const targets = await DeploymentTargetEntity.query().filterField('deploymentId', deploymentId).find();
        for (const target of targets) {
            if (target.status === 'deployed' || target.status === 'failed') continue;
            await this.updateTargetStatus(target, 'failed', `Deployment did not reach successful monitoring: ${message}`);
        }
    }

    private async updateStatus(deployment: DeploymentEntity, status: DeploymentStatus, message: string, commitUrl?: string): Promise<void> {
        deployment.status = status;
        deployment.statusMessage = this.truncate(message);
        deployment.updatedAt = new Date();
        await deployment.save();

        await this.publishStatus(deployment, status, message, commitUrl);
    }

    private async publishStatus(deployment: DeploymentEntity, status: DeploymentStatus, message: string, commitUrl?: string): Promise<void> {
        const channel = getDeploymentChannel(deployment.id);
        const event: DeploymentStatusEvent = { status, message };
        if (commitUrl) event.commitUrl = commitUrl;
        channel.publish(event);
    }

    private async updateTargetStatus(target: DeploymentTargetEntity, status: DeploymentTargetEntity['status'], message: string): Promise<void> {
        target.status = status;
        target.statusMessage = this.truncate(message);
        target.completedAt = status === 'deployed' || status === 'failed' ? new Date() : null;
        target.updatedAt = new Date();
        await target.save();
        await this.publishTargetStatus(target, status, message);
    }

    private async publishTargetStatus(target: DeploymentTargetEntity, status: DeploymentTargetEntity['status'], message: string): Promise<void> {
        const channel = getDeploymentChannel(target.deploymentId);
        const event: DeploymentTargetStatusEvent = {
            target: {
                id: target.id,
                clusterId: target.clusterId,
                clusterName: target.clusterName,
                status,
                message
            }
        };
        channel.publish(event);
    }

    private truncate(message: string): string {
        return message.length > 255 ? message.substring(0, 252) + '...' : message;
    }
}
