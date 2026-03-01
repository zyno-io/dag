import {
    http,
    HttpBadRequestError,
    HttpBody,
    HttpNotFoundError,
    HttpRequest,
    HttpResponse,
    HttpUnauthorizedError,
    UploadedFile
} from '@deepkit/http';
import { ScopedLogger } from '@deepkit/logger';
import { createEntity, WorkerService } from '@zyno-io/dk-server-foundation';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AppConfig } from '../config';
import { DB } from '../database';
import { JobTokenVerificationError } from '../errors';
import { AppEntity } from '../entities/app.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { DeploymentJob } from '../services/deployment.job';
import { getDeploymentChannel } from '../services/deployment.service';
import { GitProviderService } from '../services/git-provider.service';

interface DeployBody {
    repoUrl: string;
    jobId: string;
    jobToken: string;
    version: string;
    chart: UploadedFile;
}

@http.controller('/api')
export class DeployController {
    constructor(
        private config: AppConfig,
        private db: DB,
        private gitProviderService: GitProviderService,
        private workerService: WorkerService,
        private logger: ScopedLogger
    ) {}

    @http.POST('deploy')
    async deploy(body: HttpBody<DeployBody>): Promise<{ deploymentId: string }> {
        const { repoUrl, jobId, jobToken, version, chart } = body;

        if (!repoUrl || !jobId || !jobToken || !version || !chart) {
            throw new HttpBadRequestError('Missing required fields: repoUrl, jobId, jobToken, version, chart');
        }

        // Normalize repo URL (remove trailing slash)
        const normalizedUrl = repoUrl.replace(/\/+$/, '');

        // Find matching app
        const app = await AppEntity.query().filterField('repoUrl', normalizedUrl).findOneOrUndefined();

        if (!app) {
            throw new HttpNotFoundError(`No app configured for repo: ${normalizedUrl}`);
        }

        // Verify job token and get branch
        let branch: string;
        try {
            branch = await this.gitProviderService.verifyJobAndGetBranch(app.gitProvider, normalizedUrl, jobId, jobToken);
        } catch (err) {
            if (err instanceof JobTokenVerificationError) {
                throw new HttpUnauthorizedError();
            }
            throw err;
        }

        // Find matching environment config
        const appEnvironment = await AppEnvironmentEntity.query().filterField('appId', app.id).filterField('branch', branch).findOneOrUndefined();

        if (!appEnvironment) {
            throw new HttpNotFoundError(`No environment configuration found for ${normalizedUrl}:${branch}`);
        }

        // Read chart file and save to staging directory
        const chartBuffer = await fs.readFile(chart.path);
        const chartDir = path.join(this.config.DATA_DIR, 'charts');
        await fs.mkdir(chartDir, { recursive: true });

        // Create deployment record
        const deployment = createEntity(DeploymentEntity, {
            appEnvironmentId: appEnvironment.id,
            ciJobId: jobId,
            version,
            commitSha: null,
            statusMessage: null
        });
        await deployment.save();

        // Stage chart file and queue job; mark deployment failed on any error
        const chartPath = path.join(chartDir, `${deployment.id}.tgz`);
        try {
            await fs.writeFile(chartPath, chartBuffer);
            await this.workerService.queueJob(DeploymentJob, {
                deploymentId: deployment.id,
                chartPath
            });
        } catch (err) {
            this.logger.error(`Failed to stage/queue deployment ${deployment.id}: ${err}`);
            deployment.status = 'failed';
            deployment.statusMessage = 'Failed to stage chart or queue deployment job';
            deployment.updatedAt = new Date();
            await deployment.save();
            await fs.unlink(chartPath).catch(() => {});
            throw err;
        }

        this.logger.log(`Deployment ${deployment.id} queued for ${normalizedUrl}:${branch}`);

        return { deploymentId: deployment.id };
    }

    @http.GET('deployments/:id/events')
    async events(id: string, request: HttpRequest, response: HttpResponse): Promise<void> {
        // Set SSE headers
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');

        // Verify deployment exists
        const deployment = await DeploymentEntity.query().filterField('id', id).findOneOrUndefined();

        if (!deployment) {
            response.writeHead(404);
            response.end();
            return;
        }

        // If already in terminal state, send final event and close
        if (deployment.status === 'deployed' || deployment.status === 'failed') {
            const data = JSON.stringify({ status: deployment.status, message: deployment.statusMessage ?? '' });
            response.write(`event: status\ndata: ${data}\n\n`);
            response.end();
            return;
        }

        // Send current status
        const currentData = JSON.stringify({ status: deployment.status, message: deployment.statusMessage ?? '' });
        response.write(`event: status\ndata: ${currentData}\n\n`);

        // Subscribe to broadcast channel for updates.
        // The broadcast channel API does not expose an unsubscribe mechanism,
        // so we use a closed flag to make the callback a no-op after disconnect.
        const channel = getDeploymentChannel(id);
        let closed = false;

        channel.subscribe(event => {
            if (closed) return;

            const data = JSON.stringify(event);
            response.write(`event: status\ndata: ${data}\n\n`);

            // Close on terminal events
            if (event.status === 'deployed' || event.status === 'failed') {
                closed = true;
                response.end();
            }
        });

        // Clean up on client disconnect
        request.on('close', () => {
            closed = true;
        });
    }
}
