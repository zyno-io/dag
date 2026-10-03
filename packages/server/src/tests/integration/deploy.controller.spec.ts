import { createEntity, TestingHelpers } from '@zyno-io/ts-server-foundation';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { AppConfig } from '../../config';
import { DeployController } from '../../controllers/deploy.controller';
import { Db } from '../../database';
import { AppEnvironmentTargetEntity } from '../../entities/app-environment-target.entity';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { DeploymentTargetEntity } from '../../entities/deployment-target.entity';
import { AppAccessService } from '../../services/app-access.service';
import { AppAuthService } from '../../services/app-auth.service';
import { DeploymentLifecycleListener } from '../../services/deployment-lifecycle.listener';
import { DeploymentService } from '../../services/deployment.service';
import { createTestingFacade } from '../helpers/testing-facade';

const tf = createTestingFacade();
TestingHelpers.installStandardHooks(tf);

describe('DeployController', () => {
    it('POST /api/deploy should return 400 for missing chart', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/deploy', {
            repoUrl: 'https://gitlab.example.com/org/unknown-repo',
            jobId: '12345',
            jobToken: 'test-token',
            version: '1.0.0'
        });

        assert.equal(response.statusCode, 400);
    });

    it('GET /api/deployments/:id/events should return 404 for unknown deployment', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/deployments/00000000-0000-0000-0000-000000000000/events', {});

        assert.equal(response.statusCode, 404);
    });
});

// Exercise real persistence and the same controller used by multipart submissions.
describe('deployment timeout snapshots', () => {
    it('pins independent target overrides and the server default at submission', async t => {
        const clusterA = createEntity(ClusterEntity, {
            name: 'trusted',
            apiUrl: 'https://trusted.example.test',
            serviceAccountToken: 'token',
            caCert: null
        });
        const clusterB = createEntity(ClusterEntity, {
            name: 'edge',
            apiUrl: 'https://edge.example.test',
            serviceAccountToken: 'token',
            caCert: null
        });
        await clusterA.save();
        await clusterB.save();
        const environment = createEntity(AppEnvironmentEntity, {
            appId: 1,
            branch: 'main',
            name: 'staging',
            iacId: 1,
            iacPath: 'charts/service',
            iacBranch: null,
            clusterId: clusterA.id,
            helmType: 'flux',
            helmNamespace: 'staging',
            helmName: 'service'
        });
        await environment.save();
        const defaultTarget = createEntity(AppEnvironmentTargetEntity, {
            appEnvironmentId: environment.id,
            clusterId: clusterA.id,
            helmType: 'flux',
            helmNamespace: 'staging',
            helmName: 'service',
            monitorTimeoutSecs: null
        });
        const edgeTarget = createEntity(AppEnvironmentTargetEntity, {
            appEnvironmentId: environment.id,
            clusterId: clusterB.id,
            helmType: 'flux',
            helmNamespace: 'staging',
            helmName: 'service',
            monitorTimeoutSecs: 28800
        });
        await defaultTarget.save();
        await edgeTarget.save();
        const config = tf.get<AppConfig>(AppConfig);
        config.DEPLOY_MONITOR_TIMEOUT_SECS = 600;
        t.after(() => {
            config.DEPLOY_MONITOR_TIMEOUT_SECS = 300;
        });
        t.mock.method(tf.get<AppAuthService>(AppAuthService), 'authenticateAndResolve', async () => ({
            appEnvironment: environment,
            commitSha: 'abc'
        }));
        t.mock.method(tf.get<DeploymentService>(DeploymentService), 'processDeployment', async () => {});
        const dir = await mkdtemp(join(tmpdir(), 'dag-timeouts-'));
        t.after(async () => {
            await rm(dir, { recursive: true, force: true });
        });
        const chartPath = join(dir, 'chart.tgz');
        await writeFile(chartPath, 'chart');
        const controller = new DeployController(
            tf.get<Db>(Db),
            tf.get<AppAccessService>(AppAccessService),
            tf.get<AppAuthService>(AppAuthService),
            tf.get<DeploymentLifecycleListener>(DeploymentLifecycleListener),
            tf.get<DeploymentService>(DeploymentService),
            { log: () => {}, error: () => {} } as any,
            config
        );
        const queued = await controller.deploy({
            repoUrl: 'https://gitlab.example.test/org/app',
            jobId: '42',
            jobToken: 'token',
            version: '1',
            chart: { path: chartPath }
        } as any);
        edgeTarget.monitorTimeoutSecs = 5;
        defaultTarget.monitorTimeoutSecs = 10;
        await edgeTarget.save();
        await defaultTarget.save();
        config.DEPLOY_MONITOR_TIMEOUT_SECS = 900;
        const snapshots = await DeploymentTargetEntity.query().filter({ deploymentId: queued.deploymentId }).orderBy('clusterId').find();
        assert.deepEqual(
            snapshots.map(target => target.monitorTimeoutSecs),
            [600, 28800]
        );
        assert.deepEqual(
            snapshots.map(target => target.clusterName),
            ['trusted', 'edge']
        );
    });
});
