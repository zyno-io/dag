import {
    DEPLOYMENT_HEARTBEAT_INTERVAL_MS,
    DeploymentStatusEvent,
    DeploymentTargetStatusEvent,
    isValidDeployMonitorTimeout
} from '@zyno-io/dag-shared';
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

import { AppConfig } from '../config';
import { Db } from '../database';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { AppAccessService } from '../services/app-access.service';
import { AppAuthService } from '../services/app-auth.service';
import { DeploymentLifecycleListener } from '../services/deployment-lifecycle.listener';
import { DeploymentEvent, DeploymentService, buildCommitUrl, getDeploymentChannel } from '../services/deployment.service';

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
        private logger: ScopedLogger,
        private config: AppConfig
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
        const targets = environmentTargets.map(target => {
            const monitorTimeoutSecs = target.monitorTimeoutSecs ?? this.config.DEPLOY_MONITOR_TIMEOUT_SECS;
            if (!isValidDeployMonitorTimeout(monitorTimeoutSecs)) {
                throw new HttpBadRequestError(
                    'Deployment target monitor timeout must be a positive whole number of seconds within the supported range'
                );
            }
            return { ...target, monitorTimeoutSecs };
        });
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

            for (const target of targets) {
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
                        monitorTimeoutSecs: target.monitorTimeoutSecs,
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
    async events(id: HttpPath<string>, _request: HttpRequest, response: HttpResponse): Promise<void> {
        // Set SSE headers
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');

        // Subscribe before asynchronous snapshot reads so a terminal update cannot be lost
        // between reading the deployment and opening the live stream.
        const channel = getDeploymentChannel(id);
        const pendingEvents: DeploymentEvent[] = [];
        let snapshotSent = false;
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const cleanup = () => {
            closed = true;
            unsubscribe();
            clearInterval(heartbeat);
            response.off('close', cleanup);
        };
        const writeEvent = (event: DeploymentEvent) => {
            if (closed) return;
            const type = 'target' in event ? 'target' : 'status';
            response.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
            if ('status' in event && (event.status === 'deployed' || event.status === 'failed')) {
                cleanup();
                response.end();
            }
        };
        const unsubscribe = channel.subscribe(event => {
            if (snapshotSent) writeEvent(event);
            else pendingEvents.push(event);
        });
        response.on('close', cleanup);

        try {
            // Verify deployment exists
            const deployment = await DeploymentEntity.query().filterField('id', id).findOneOrUndefined();

            if (!deployment) {
                cleanup();
                response.writeHead(404);
                response.end();
                return;
            }
            if (closed) return;
            heartbeat = setInterval(() => {
                response.write('event: heartbeat\ndata: {}\n\n');
            }, DEPLOYMENT_HEARTBEAT_INTERVAL_MS);

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
            if (closed) return;
            for (const target of targets) {
                const targetEvent: DeploymentTargetStatusEvent = {
                    target: {
                        id: target.id,
                        clusterId: target.clusterId,
                        clusterName: target.clusterName,
                        monitorTimeoutSecs: target.monitorTimeoutSecs,
                        status: target.status,
                        message: target.statusMessage ?? ''
                    }
                };
                writeEvent(targetEvent);
            }

            // Send the current parent status after the target snapshot. A terminal snapshot
            // closes the stream; otherwise flush updates captured during the database reads.
            const currentEvent: DeploymentStatusEvent = { status: deployment.status, message: deployment.statusMessage ?? '' };
            if (commitUrl) currentEvent.commitUrl = commitUrl;
            writeEvent(currentEvent);
            if (closed) return;
            snapshotSent = true;
            for (const event of pendingEvents) writeEvent(event);
        } catch (err) {
            cleanup();
            throw err;
        }
    }
}
