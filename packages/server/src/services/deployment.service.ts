import { ScopedLogger } from '@deepkit/logger';
import type { DeploymentStatus, DeploymentStatusEvent } from '@zyno-io/dag-shared';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

import { AppEntity } from '../entities/app.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { ChartService } from './chart.service';
import { IacRepoService } from './iac-repo.service';
import { K8sMonitorService } from './k8s-monitor.service';

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

const deploymentEmitter = new EventEmitter();

export function getDeploymentChannel(deploymentId: string) {
    return {
        publish(data: DeploymentStatusEvent) {
            deploymentEmitter.emit(deploymentId, data);
        },
        subscribe(fn: (data: DeploymentStatusEvent) => void) {
            deploymentEmitter.on(deploymentId, fn);
            return () => {
                deploymentEmitter.off(deploymentId, fn);
            };
        }
    };
}

export class DeploymentService {
    constructor(
        private iacRepoService: IacRepoService,
        private chartService: ChartService,
        private k8sMonitorService: K8sMonitorService,
        private logger: ScopedLogger
    ) {}

    async processDeployment(deploymentId: string, chartBuffer: Buffer): Promise<void> {
        const deployment = await DeploymentEntity.query().filterField('id', deploymentId).findOne();
        let commitUrl: string | undefined;

        try {
            const appEnvironment = await AppEnvironmentEntity.query().filterField('id', deployment.appEnvironmentId).findOne();
            const app = await AppEntity.query().filterField('id', appEnvironment.appId).findOne();
            const iac = await IacEntity.query().filterField('id', appEnvironment.iacId).findOne();
            const cluster = await ClusterEntity.query().filterField('id', appEnvironment.clusterId).findOne();

            // Step 1: Validate job token
            await this.updateStatus(deployment, 'validating', `Verifying job token with ${app.gitProvider}...`);

            // Step 2: Capture pre-deploy state, then push chart to IAC repo
            const preDeploySnapshot = await this.k8sMonitorService.capturePreDeployState(cluster, appEnvironment);
            await this.updateStatus(deployment, 'pushing', 'Pushing chart to IAC repo...');

            const commitSha = await this.iacRepoService.withRepoLock(iac, appEnvironment.iacBranch, async localPath => {
                await this.iacRepoService.extractChart(localPath, appEnvironment.iacPath, chartBuffer);
                await this.chartService.updateChartVersion(path.join(localPath, appEnvironment.iacPath), deployment.version);
                return this.iacRepoService.commitAndPush(
                    localPath,
                    iac,
                    `[${app.repoUrl.split('/').pop()}] deploy ${deployment.version}\n\nRepo: ${app.repoUrl}\nTarget: ${appEnvironment.iacPath}\nJob: ${deployment.ciJobId}`,
                    appEnvironment.iacBranch
                );
            });

            deployment.commitSha = commitSha;
            commitUrl = buildCommitUrl(iac.repoUrl, commitSha);
            await this.updateStatus(deployment, 'pushed', `Chart pushed to IAC repo (${commitSha.substring(0, 8)})`, commitUrl);

            // Step 3: Monitor K8s deployment
            await this.updateStatus(deployment, 'monitoring', `Watching deployment on cluster ${cluster.name}...`, commitUrl);

            await this.k8sMonitorService.watchDeployment(
                cluster,
                appEnvironment,
                {
                    onStatusChange: async message => {
                        await this.publishStatus(deployment, 'monitoring', message, commitUrl);
                    }
                },
                preDeploySnapshot
            );

            await this.updateStatus(deployment, 'deployed', 'Deployment completed successfully', commitUrl);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Deployment ${deploymentId} failed:`, err);
            await this.updateStatus(deployment, 'failed', message, commitUrl);
            throw err;
        }
    }

    private async updateStatus(deployment: DeploymentEntity, status: DeploymentStatus, message: string, commitUrl?: string): Promise<void> {
        deployment.status = status;
        deployment.statusMessage = message.length > 255 ? message.substring(0, 252) + '...' : message;
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
}
