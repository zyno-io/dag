import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEntity, TestingHelpers, uuid7 } from '@zyno-io/dk-server-foundation';

import { createTestingFacade } from '../helpers/testing-facade';
import { AppEntity } from '../../entities/app.entity';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { DeploymentEntity } from '../../entities/deployment.entity';
import { IacEntity } from '../../entities/iac.entity';

const tf = createTestingFacade();
TestingHelpers.installStandardHooks(tf);

async function seedDeployment() {
    const app = createEntity(AppEntity, {
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/org/test-app'
    });
    await app.save();

    const cluster = createEntity(ClusterEntity, {
        name: 'test-cluster',
        apiUrl: 'https://k8s.example.com:6443',
        serviceAccountToken: 'test-token',
        caCert: null
    });
    await cluster.save();

    const iac = createEntity(IacEntity, {
        name: 'test-iac',
        repoUrl: 'https://gitlab.example.com/org/iac.git',
        accessToken: 'test-token'
    });
    await iac.save();

    const appEnv = createEntity(AppEnvironmentEntity, {
        appId: app.id,
        branch: 'main',
        iacId: iac.id,
        iacPath: 'charts/test-app',
        clusterId: cluster.id,
        helmType: 'flux',
        helmNamespace: 'default',
        helmName: 'test-app',
        iacBranch: null
    });
    await appEnv.save();

    const deployment = createEntity(DeploymentEntity, {
        id: uuid7(),
        appEnvironmentId: appEnv.id,
        ciJobId: '99999',
        version: '1.0.0',
        commitSha: null,
        statusMessage: null
    });
    await deployment.save();

    return deployment;
}

describe('DeploymentEntity status enum save()', () => {
    it('should persist all status transitions via save()', async () => {
        const deployment = await seedDeployment();
        assert.equal(deployment.status, 'pending');

        const statuses = ['validating', 'pushing', 'pushed', 'monitoring', 'deployed', 'failed'] as const;

        for (const status of statuses) {
            deployment.status = status;
            deployment.statusMessage = `Testing ${status}`;
            deployment.updatedAt = new Date();
            await deployment.save();

            const reloaded = await DeploymentEntity.query().filterField('id', deployment.id).findOne();
            assert.equal(reloaded.status, status, `status should be '${status}' after save()`);
            assert.equal(reloaded.statusMessage, `Testing ${status}`);
        }
    });
});
