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
import { createEntity, uuid7 } from '@zyno-io/dk-server-foundation';
import * as fs from 'node:fs/promises';

import { JobTokenVerificationError } from '../errors';
import { AppEntity } from '../entities/app.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { DeploymentLifecycleListener } from '../services/deployment-lifecycle.listener';
import { DeploymentService, buildCommitUrl, getDeploymentChannel } from '../services/deployment.service';
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
        private deploymentLifecycle: DeploymentLifecycleListener,
        private deploymentService: DeploymentService,
        private gitProviderService: GitProviderService,
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
                this.logger.warn(`Job token verification failed for ${normalizedUrl} job ${jobId}: ${err.message}`);
                throw new HttpUnauthorizedError(err.message);
            }
            throw err;
        }

        // Find matching environment config
        const appEnvironment = await AppEnvironmentEntity.query().filterField('appId', app.id).filterField('branch', branch).findOneOrUndefined();

        if (!appEnvironment) {
            throw new HttpNotFoundError(`No environment configuration found for ${normalizedUrl}:${branch}`);
        }

        // Read chart file
        const chartBuffer = await fs.readFile(chart.path);

        // Create deployment record
        const deployment = createEntity(DeploymentEntity, {
            id: uuid7(),
            appEnvironmentId: appEnvironment.id,
            ciJobId: jobId,
            version,
            commitSha: null,
            statusMessage: null
        });
        await deployment.save();

        // Process deployment in the background (fire-and-forget)
        const deploymentPromise = this.deploymentService.processDeployment(deployment.id, chartBuffer).catch(err => {
            this.logger.error(`Deployment ${deployment.id} failed:`, err);
        });
        this.deploymentLifecycle.trackDeployment(deploymentPromise);

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

        // Resolve commit URL if a commit SHA exists on this deployment
        let commitUrl: string | undefined;
        if (deployment.commitSha) {
            const appEnv = await AppEnvironmentEntity.query().filterField('id', deployment.appEnvironmentId).findOneOrUndefined();
            if (appEnv) {
                const iac = await IacEntity.query().filterField('id', appEnv.iacId).findOneOrUndefined();
                if (iac) {
                    commitUrl = buildCommitUrl(iac.repoUrl, deployment.commitSha);
                }
            }
        }

        // If already in terminal state, send final event and close
        if (deployment.status === 'deployed' || deployment.status === 'failed') {
            const event: Record<string, unknown> = { status: deployment.status, message: deployment.statusMessage ?? '' };
            if (commitUrl) event.commitUrl = commitUrl;
            const data = JSON.stringify(event);
            response.write(`event: status\ndata: ${data}\n\n`);
            response.end();
            return;
        }

        // Send current status
        const currentEvent: Record<string, unknown> = { status: deployment.status, message: deployment.statusMessage ?? '' };
        if (commitUrl) currentEvent.commitUrl = commitUrl;
        const currentData = JSON.stringify(currentEvent);
        response.write(`event: status\ndata: ${currentData}\n\n`);

        // Subscribe to local event channel for updates
        const channel = getDeploymentChannel(id);

        // Send periodic heartbeat comments to prevent proxy/LB timeouts
        const heartbeat = setInterval(() => {
            response.write('event: heartbeat\ndata: {}\n\n');
        }, 15_000);

        const cleanup = () => {
            unsubscribe();
            clearInterval(heartbeat);
        };

        const unsubscribe = channel.subscribe(event => {
            const data = JSON.stringify(event);
            response.write(`event: status\ndata: ${data}\n\n`);

            // Close on terminal events
            if (event.status === 'deployed' || event.status === 'failed') {
                cleanup();
                response.end();
            }
        });

        // Clean up on client disconnect
        request.on('close', cleanup);
    }
}
