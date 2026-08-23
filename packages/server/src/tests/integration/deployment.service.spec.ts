import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { AppEntity } from '../../entities/app.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { DeploymentTargetEntity } from '../../entities/deployment-target.entity';
import { DeploymentEntity } from '../../entities/deployment.entity';
import { IacEntity } from '../../entities/iac.entity';
import { DeploymentService } from '../../services/deployment.service';

function queryForOne(value: unknown) {
    const query = {
        filterField: () => query,
        filter: () => query,
        findOne: async () => value,
        findOneOrUndefined: async () => value
    };
    return query;
}

function queryForMany(values: unknown[]) {
    const query = {
        filterField: () => query,
        filter: () => query,
        find: async () => values
    };
    return query;
}

describe('DeploymentService multi-cluster orchestration', () => {
    it('monitors all targets concurrently and fails the aggregate only after they settle', async () => {
        const deployment = {
            id: '01900000-0000-7000-8000-000000000001',
            appEnvironmentId: 1,
            ciJobId: '42',
            version: '1.0.0',
            commitSha: null,
            sourceCommitSha: 'abc',
            status: 'pending',
            statusMessage: null,
            updatedAt: new Date(),
            save: async () => {}
        } as unknown as DeploymentEntity;
        const targets = [
            {
                id: '01900000-0000-7000-8000-000000000101',
                deploymentId: deployment.id,
                clusterId: 1,
                clusterName: 'east',
                helmType: 'flux',
                helmNamespace: 'default',
                helmName: 'service',
                status: 'pending',
                statusMessage: null,
                completedAt: null,
                updatedAt: new Date(),
                save: async () => {}
            },
            {
                id: '01900000-0000-7000-8000-000000000102',
                deploymentId: deployment.id,
                clusterId: 2,
                clusterName: 'west',
                helmType: 'plain',
                helmNamespace: 'default',
                helmName: 'service',
                status: 'pending',
                statusMessage: null,
                completedAt: null,
                updatedAt: new Date(),
                save: async () => {}
            }
        ] as unknown as DeploymentTargetEntity[];
        const clusters = [
            { id: 1, name: 'east', apiUrl: 'https://east.example.test' },
            { id: 2, name: 'west', apiUrl: 'https://west.example.test' }
        ] as ClusterEntity[];

        const originalDeploymentQuery = DeploymentEntity.query;
        const originalTargetQuery = DeploymentTargetEntity.query;
        const originalEnvironmentQuery = AppEnvironmentEntity.query;
        const originalAppQuery = AppEntity.query;
        const originalIacQuery = IacEntity.query;
        const originalClusterQuery = ClusterEntity.query;

        let releaseMonitors: () => void;
        const monitorsReleased = new Promise<void>(resolve => {
            releaseMonitors = resolve;
        });
        let bothMonitorsStarted: () => void;
        const bothStarted = new Promise<void>(resolve => {
            bothMonitorsStarted = resolve;
        });
        const started: string[] = [];

        try {
            DeploymentEntity.query = (() => queryForOne(deployment)) as any;
            DeploymentTargetEntity.query = (() => queryForMany(targets)) as any;
            AppEnvironmentEntity.query = (() =>
                queryForOne({ appId: 1, iacId: 1, iacPath: 'charts/service', iacBranch: null, branch: 'main', name: 'prod' })) as any;
            AppEntity.query = (() => queryForOne({ gitProvider: 'gitlab', repoUrl: 'https://gitlab.example.test/org/service' })) as any;
            IacEntity.query = (() => queryForOne({ repoUrl: 'https://gitlab.example.test/org/iac' })) as any;
            ClusterEntity.query = (() => queryForMany(clusters)) as any;

            const service = new DeploymentService(
                {
                    withRepoLock: async (_iac: IacEntity, _branch: string | null, work: (localPath: string) => Promise<string>) => work('/tmp/iac'),
                    extractChart: async () => {},
                    commitAndPush: async () => 'deadbeefcafefeed'
                } as any,
                { updateChartVersion: async () => {} } as any,
                {
                    capturePreDeployState: async () => null,
                    watchDeployment: async (cluster: ClusterEntity) => {
                        started.push(cluster.name);
                        if (started.length === 2) bothMonitorsStarted();
                        await monitorsReleased;
                        if (cluster.name === 'west') throw new Error('Helm release service failed');
                    }
                } as any,
                { error: () => {} } as any
            );

            const processing = service.processDeployment(deployment.id, Buffer.from('chart'), 'abc');
            await bothStarted;
            assert.deepEqual(started.sort(), ['east', 'west']);

            releaseMonitors!();
            await assert.rejects(processing, /1 of 2 cluster targets failed/);
            assert.equal(deployment.status, 'failed');
            assert.equal(targets[0].status, 'deployed');
            assert.equal(targets[1].status, 'failed');
        } finally {
            DeploymentEntity.query = originalDeploymentQuery;
            DeploymentTargetEntity.query = originalTargetQuery;
            AppEnvironmentEntity.query = originalEnvironmentQuery;
            AppEntity.query = originalAppQuery;
            IacEntity.query = originalIacQuery;
            ClusterEntity.query = originalClusterQuery;
        }
    });
});
