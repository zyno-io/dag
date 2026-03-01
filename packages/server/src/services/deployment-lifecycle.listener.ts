import { eventDispatcher } from '@deepkit/event';
import { onServerBootstrapDone } from '@deepkit/framework';
import { ScopedLogger } from '@deepkit/logger';
import { onServerShutdownRequested } from '@zyno-io/dk-server-foundation';

import { DB } from '../database';
import { DeploymentEntity } from '../entities/deployment.entity';
import { getDeploymentChannel } from './deployment.service';

/**
 * Statuses where we hold chart data only in memory and have not yet
 * completed the IAC repo push.  On startup these are unrecoverable.
 */
const INCOMPLETE_STATUSES = ['pending', 'validating', 'pushing'] as const;

export class DeploymentLifecycleListener {
    /** Resolvers for in-flight deployments awaiting graceful shutdown. */
    private inflightDeployments = new Set<Promise<void>>();

    constructor(
        private db: DB,
        private logger: ScopedLogger
    ) {}

    /** Track an in-flight deployment so shutdown can wait for it. */
    trackDeployment(promise: Promise<void>): void {
        this.inflightDeployments.add(promise);
        promise.finally(() => this.inflightDeployments.delete(promise));
    }

    @eventDispatcher.listen(onServerBootstrapDone)
    async onBootstrap(): Promise<void> {
        let stale: DeploymentEntity[];
        try {
            stale = await this.db.query(DeploymentEntity)
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
        const message = 'Server restarted before IAC repo push completed';
        for (const deployment of stale) {
            await this.db.query(DeploymentEntity)
                .filter({ id: deployment.id })
                .patchOne({ status: 'failed', statusMessage: message, updatedAt: new Date() });

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
