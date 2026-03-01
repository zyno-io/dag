import { ScopedLogger } from '@deepkit/logger';
import { BaseJob, WorkerJob } from '@zyno-io/dk-server-foundation';
import * as fs from 'node:fs/promises';

import { DeploymentEntity } from '../entities/deployment.entity';
import { DeploymentService, getDeploymentChannel } from './deployment.service';

interface DeploymentJobData {
    deploymentId: string;
    chartPath: string;
}

@WorkerJob()
export class DeploymentJob extends BaseJob<DeploymentJobData> {
    constructor(
        private deploymentService: DeploymentService,
        private logger: ScopedLogger
    ) {
        super();
    }

    async handle(data: DeploymentJobData): Promise<void> {
        this.logger.log(`Processing deployment job: ${data.deploymentId}`);

        let chartBuffer: Buffer;
        try {
            chartBuffer = await fs.readFile(data.chartPath);
        } catch (err) {
            this.logger.error(`Failed to read staged chart for deployment ${data.deploymentId}: ${err}`);
            const deployment = await DeploymentEntity.query().filterField('id', data.deploymentId).findOneOrUndefined();
            if (deployment) {
                deployment.status = 'failed';
                deployment.statusMessage = 'Failed to read staged chart file';
                deployment.updatedAt = new Date();
                await deployment.save();
                getDeploymentChannel(data.deploymentId).publish({
                    status: 'failed',
                    message: deployment.statusMessage
                });
            }
            throw err;
        }

        await this.deploymentService.processDeployment(data.deploymentId, chartBuffer);
        await fs.unlink(data.chartPath).catch(() => {});
    }
}
