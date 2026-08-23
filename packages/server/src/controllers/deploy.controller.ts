import {
    createPersistedEntity,
    FileUpload,
    http,
    HttpBadRequestError,
    HttpBody,
    HttpPath,
    HttpRequest,
    HttpResponse,
    ScopedLogger,
    uuid7
} from '@zyno-io/ts-server-foundation';
import * as fs from 'node:fs/promises';

import { Db } from '../database';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { AppAccessService } from '../services/app-access.service';
import { AppAuthService } from '../services/app-auth.service';
import { DeploymentLifecycleListener } from '../services/deployment-lifecycle.listener';
import { DeploymentService, buildCommitUrl, getDeploymentChannel } from '../services/deployment.service';

interface DeployBody {
    repoUrl: string;
    jobId: string;
    jobToken: string;
    environment?: string;
    version: string;
    chart: FileUpload;
}

@http.controller('/api')
export class DeployController {
    constructor(
        private db: Db,
        private appAccess: AppAccessService,
        private appAuthService: AppAuthService,
        private deploymentLifecycle: DeploymentLifecycleListener,
        private deploymentService: DeploymentService,
        private logger: ScopedLogger
    ) {}

    @http.POST('deploy')
    async deploy(body: HttpBody<DeployBody>): Promise<{ deploymentId: string }> {
        const { repoUrl, jobId, jobToken, environment, version, chart } = body;

        if (!repoUrl || !jobId || !jobToken || !version || !chart) {
            throw new HttpBadRequestError('Missing required fields: repoUrl, jobId, jobToken, version, chart');
        }

        const { appEnvironment, commitSha: ciCommitSha } = await this.appAuthService.authenticateAndResolve(repoUrl, jobId, jobToken, environment);

        // Read chart file
        const chartBuffer = await fs.readFile(chart.path);

        // Snapshot all targets before background work starts. This pins an in-flight deployment
        // to the exact clusters and Helm resources selected at submission time.
        const targetsByEnvironment = await this.appAccess.targetsFor([appEnvironment]);
        const environmentTargets = targetsByEnvironment.get(appEnvironment.id) ?? [];
        const clusterIds = [...new Set(environmentTargets.map(target => target.clusterId))];
        const clusters = await ClusterEntity.query()
            .filter({ id: { $in: clusterIds } })
            .find();
        const clustersById = new Map(clusters.map(cluster => [cluster.id, cluster]));
        if (environmentTargets.some(target => !clustersById.has(target.clusterId))) {
            throw new HttpBadRequestError('One or more configured deployment target clusters no longer exist');
        }

        const deployment = await this.db.transaction(async session => {
            const now = new Date();
            const created = await createPersistedEntity(
                DeploymentEntity,
                {
                    id: uuid7(),
                    appEnvironmentId: appEnvironment.id,
                    ciJobId: jobId,
                    version,
                    commitSha: null,
                    sourceCommitSha: ciCommitSha,
                    statusMessage: null,
                    createdAt: now,
                    updatedAt: now
                },
                session
            );

            for (const target of environmentTargets) {
                const cluster = clustersById.get(target.clusterId)!;
                await createPersistedEntity(
                    DeploymentTargetEntity,
                    {
                        id: uuid7(),
                        deploymentId: created.id,
                        environmentTargetId: target.id,
                        clusterId: target.clusterId,
                        clusterName: cluster.name,
                        helmType: target.helmType,
                        helmNamespace: target.helmNamespace,
                        helmName: target.helmName,
                        statusMessage: null,
                        completedAt: null,
                        createdAt: now,
                        updatedAt: now
                    },
                    session
                );
            }

            return created;
        });

        // Process deployment in the background (fire-and-forget)
        const deploymentPromise = this.deploymentService.processDeployment(deployment.id, chartBuffer, ciCommitSha).catch(err => {
            this.logger.error(`Deployment ${deployment.id} failed:`, err);
        });
        this.deploymentLifecycle.trackDeployment(deploymentPromise);

        this.logger.log(`Deployment ${deployment.id} queued for ${repoUrl}`);

        return { deploymentId: deployment.id };
    }

    @http.GET('deployments/:id/events')
    async events(id: HttpPath<string>, request: HttpRequest, response: HttpResponse): Promise<void> {
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

        // Send a target snapshot before the parent status so reconnecting clients can recover
        // per-cluster progress even if they missed earlier live events.
        const targets = await DeploymentTargetEntity.query().filterField('deploymentId', deployment.id).find();
        for (const target of targets) {
            const targetEvent = {
                target: {
                    id: target.id,
                    clusterId: target.clusterId,
                    clusterName: target.clusterName,
                    status: target.status,
                    message: target.statusMessage ?? ''
                }
            };
            response.write(`event: target\ndata: ${JSON.stringify(targetEvent)}\n\n`);
        }

        // If already in a terminal state, send the full target snapshot followed by the final
        // parent event and close.
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
            if ('target' in event) {
                response.write(`event: target\ndata: ${JSON.stringify(event)}\n\n`);
                return;
            }

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
