import { ScopedLogger } from '@deepkit/logger';
import { createBroadcastChannel } from '@zyno-io/dk-server-foundation';
import type { DeploymentStatus, DeploymentStatusEvent } from '@zyno-io/dag-shared';
import * as path from 'node:path';

import { DB } from '../database';
import { AppEntity } from '../entities/app.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { ChartService } from './chart.service';
import { GitProviderService } from './git-provider.service';
import { IacRepoService } from './iac-repo.service';
import { K8sMonitorService } from './k8s-monitor.service';

export function getDeploymentChannel(deploymentId: string) {
    return createBroadcastChannel<DeploymentStatusEvent>(`deployment:${deploymentId}`);
}

export class DeploymentService {
    constructor(
        private db: DB,
        private gitProviderService: GitProviderService,
        private iacRepoService: IacRepoService,
        private chartService: ChartService,
        private k8sMonitorService: K8sMonitorService,
        private logger: ScopedLogger
    ) {}

    async processDeployment(deploymentId: string, chartBuffer: Buffer): Promise<void> {
        const deployment = await DeploymentEntity.query().filterField('id', deploymentId).findOne();

        try {
            const appEnvironment = await AppEnvironmentEntity.query().filterField('id', deployment.appEnvironmentId).findOne();
            const app = await AppEntity.query().filterField('id', appEnvironment.appId).findOne();
            const iac = await IacEntity.query().filterField('id', appEnvironment.iacId).findOne();
            const cluster = await ClusterEntity.query().filterField('id', appEnvironment.clusterId).findOne();

            // Step 1: Validate job token
            await this.updateStatus(deployment, 'validating', `Verifying job token with ${app.gitProvider}...`);

            // Step 2: Push chart to IAC repo (with mutex)
            await this.updateStatus(deployment, 'pushing', 'Pushing chart to IAC repo...');

            const commitSha = await this.iacRepoService.withRepoLock(iac, appEnvironment.iacBranch, async localPath => {
                await this.iacRepoService.extractChart(localPath, appEnvironment.iacPath, chartBuffer);
                await this.chartService.updateChartVersion(path.join(localPath, appEnvironment.iacPath), deployment.version);
                return this.iacRepoService.commitAndPush(
                    localPath,
                    iac,
                    `deploy: ${app.repoUrl} → ${appEnvironment.iacPath} (job ${deployment.ciJobId})`,
                    appEnvironment.iacBranch
                );
            });

            deployment.commitSha = commitSha;
            await this.updateStatus(deployment, 'pushed', `Chart pushed to IAC repo (${commitSha.substring(0, 8)})`);

            // Step 3: Monitor K8s deployment
            await this.updateStatus(deployment, 'monitoring', `Watching deployment on cluster ${cluster.name}...`);

            await this.k8sMonitorService.watchDeployment(cluster, appEnvironment, {
                onStatusChange: async message => {
                    await this.publishStatus(deployment, 'monitoring', message);
                }
            });

            await this.updateStatus(deployment, 'deployed', 'Deployment completed successfully');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Deployment ${deploymentId} failed: ${message}`);
            await this.updateStatus(deployment, 'failed', message);
            throw err;
        }
    }

    private async updateStatus(deployment: DeploymentEntity, status: DeploymentStatus, message: string): Promise<void> {
        deployment.status = status;
        deployment.statusMessage = message;
        deployment.updatedAt = new Date();
        await deployment.save();

        await this.publishStatus(deployment, status, message);
    }

    private async publishStatus(deployment: DeploymentEntity, status: DeploymentStatus, message: string): Promise<void> {
        const channel = getDeploymentChannel(deployment.id);
        channel.publish({ status, message });
    }
}
