import { eventDispatcher, onServerMainBootstrapDone, onServerShutdownRequested, ScopedLogger } from '@zyno-io/ts-server-foundation';

import { Db } from '../database';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { getDeploymentChannel } from './deployment.service';

/**
 * DAG has no durable work queue. After a process crash, no background monitor remains to
 * produce a terminal result, even if the IaC push had already completed. Fail closed instead
 * of leaving the CI gate and per-target results permanently in progress.
 */
const INCOMPLETE_STATUSES = ['pending', 'validating', 'pushing', 'pushed', 'monitoring'] as const;

export class DeploymentLifecycleListener {
    /** Resolvers for in-flight deployments awaiting graceful shutdown. */
    private inflightDeployments = new Set<Promise<void>>();

    constructor(
        private db: Db,
        private logger: ScopedLogger
    ) {}

    /** Track an in-flight deployment so shutdown can wait for it. */
    trackDeployment(promise: Promise<void>): void {
        this.inflightDeployments.add(promise);
        promise.finally(() => this.inflightDeployments.delete(promise));
    }

    @eventDispatcher.listen(onServerMainBootstrapDone)
    async onBootstrap(): Promise<void> {
        let stale: DeploymentEntity[];
        try {
            stale = await this.db
                .query(DeploymentEntity)
                .filter({ status: { $in: [...INCOMPLETE_STATUSES] } })
                .find();
        } catch {
            // Table may not exist yet on first boot before migrations
            return;
        }

        if (stale.length === 0) return;

        this.logger.log(`Marking ${stale.length} incomplete deployment(s) as failed`);

        // Use patchOne() instead of entity.save() because save() goes through
        // batchUpdate which generates CASE expressions — PostgreSQL can't resolve
        // text vs enum types in CASE branches even with an implicit cast.
        for (const deployment of stale) {
            const message =
                deployment.status === 'pushed' || deployment.status === 'monitoring'
                    ? 'Server restarted before deployment monitoring completed'
                    : 'Server restarted before IAC repo push completed';
            await this.db
                .query(DeploymentEntity)
                .filter({ id: deployment.id })
                .patchOne({ status: 'failed', statusMessage: message, updatedAt: new Date() });

            const targets = await this.db
                .query(DeploymentTargetEntity)
                .filter({ deploymentId: deployment.id, status: { $in: ['pending', 'monitoring'] } })
                .find();
            for (const target of targets) {
                await this.db.query(DeploymentTargetEntity).filter({ id: target.id }).patchOne({
                    status: 'failed',
                    statusMessage: message,
                    completedAt: new Date(),
                    updatedAt: new Date()
                });
                getDeploymentChannel(deployment.id).publish({
                    target: {
                        id: target.id,
                        clusterId: target.clusterId,
                        clusterName: target.clusterName,
                        status: 'failed',
                        message
                    }
                });
            }

            getDeploymentChannel(deployment.id).publish({ status: 'failed', message });
        }
    }

    @eventDispatcher.listen(onServerShutdownRequested)
    async onShutdown(): Promise<void> {
        if (this.inflightDeployments.size === 0) return;

        this.logger.log(`Waiting for ${this.inflightDeployments.size} in-flight deployment(s) to finish...`);
        await Promise.allSettled(this.inflightDeployments);
        this.logger.log('All in-flight deployments finished');
    }
}
