import { createEntity, JWT, TestingHelpers, uuid } from '@zyno-io/ts-server-foundation';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CoreAppOptions } from '../../app';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { AppEntity } from '../../entities/app.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { DeploymentEntity } from '../../entities/deployment.entity';
import { IacEntity } from '../../entities/iac.entity';
import { UserEntity } from '../../entities/user.entity';
import { decryptValue } from '../../helpers/crypto';
import { GitLabService, ProjectAccessLevel } from '../../services/gitlab.service';
import { MIGRATIONS_DIR } from '../helpers/testing-facade';

// JWT.generate needs a signing key; the app would normally get one from the environment.
process.env.AUTH_JWT_SECRET ??= 'test-jwt-secret-please-do-not-use-in-prod';
// Must match the host of the seeded IaC repo, or no project path can be derived from its URL
// and every user is denied regardless of their access level.
process.env.GITLAB_URL ??= 'https://gitlab.example.com';
// Encrypting the persisted GitLab session tokens needs a crypto key (32 bytes).
process.env.CRYPTO_SECRET ??= 'test-crypto-secret-change-me-32c';

/**
 * Access levels are keyed by GitLab user id rather than set globally, so each test can act as
 * several users at once without fighting the shared GitLab project-access cache.
 */
const ACCESS_BY_GITLAB_USER = new Map<string, ProjectAccessLevel>([
    ['gl-none', 'none'],
    ['gl-reporter', 'reporter'],
    ['gl-maintainer', 'maintainer']
]);

// Per-(user, project-path) overrides, for modelling a user whose access differs across repos —
// e.g. the grafter is only a reporter on the app's repo but a maintainer on their own.
const ACCESS_BY_USER_AND_PATH = new Map<string, ProjectAccessLevel>([
    ['gl-grafter|org/iac-repo', 'reporter'],
    ['gl-grafter|attacker/iac-repo', 'maintainer'],
    ['gl-app-owner|org/my-app', 'reporter'],
    ['gl-partial-iac|org/iac-repo', 'reporter']
]);

/** Stands in for the real GitLab API — the only place the permission model reaches the network. */
class StubGitLabService extends GitLabService {
    override async getProjectAccessLevel(user: UserEntity, projectPath: string): Promise<ProjectAccessLevel> {
        const scoped = ACCESS_BY_USER_AND_PATH.get(`${user.gitlabUserId}|${projectPath}`);
        if (scoped) return scoped;
        return ACCESS_BY_GITLAB_USER.get(user.gitlabUserId) ?? 'none';
    }
}

TestingHelpers.setDefaultDatabaseConfig({
    PG_HOST: 'localhost',
    PG_PORT: 5432,
    PG_USER: 'dag',
    PG_PASSWORD_SECRET: 'dag'
});

const tf = TestingHelpers.createTestingFacade(
    {
        ...CoreAppOptions,
        providers: [
            ...CoreAppOptions.providers!.filter(provider => provider !== GitLabService),
            { provide: GitLabService, useClass: StubGitLabService }
        ]
    },
    { enableDatabase: true, enableMigrations: true, migrationsDir: MIGRATIONS_DIR, dbAdapter: 'postgres' }
);
// Seed once and restore to that savepoint before each test; the standard beforeEach otherwise
// resets the database to empty and would take the seeded users with it.
TestingHelpers.installStandardHooks(tf, { suiteSeedData: seed });

let appId: number;
let environmentId: number;
let iacId: number;
let attackerIacId: number;
let clusterId: number;
const tokens: Record<string, string> = {};

async function seed() {
    const iac = createEntity(IacEntity, {
        name: 'prod-iac',
        repoUrl: 'https://gitlab.example.com/org/iac-repo.git',
        accessToken: 'test-access-token'
    });
    await iac.save();
    iacId = iac.id;

    // A second IaC repo the attacker maintains but which is not part of the victim app.
    const attackerIac = createEntity(IacEntity, {
        name: 'attacker-iac',
        repoUrl: 'https://gitlab.example.com/attacker/iac-repo.git',
        accessToken: 'attacker-token'
    });
    await attackerIac.save();
    attackerIacId = attackerIac.id;

    const cluster = createEntity(ClusterEntity, {
        name: 'prod-1',
        apiUrl: 'https://k8s.example.com:6443',
        serviceAccountToken: 'test-token',
        caCert: null
    });
    await cluster.save();
    clusterId = cluster.id;

    const app = createEntity(AppEntity, {
        name: 'my-app',
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/org/my-app'
    });
    await app.save();
    appId = app.id;

    const environment = createEntity(AppEnvironmentEntity, {
        appId: app.id,
        branch: 'main',
        name: 'main',
        iacId: iac.id,
        iacPath: 'charts/my-app',
        clusterId: cluster.id,
        helmType: 'flux',
        helmNamespace: 'default',
        helmName: 'my-app',
        iacBranch: null
    });
    await environment.save();
    environmentId = environment.id;

    for (const gitlabUserId of [...ACCESS_BY_GITLAB_USER.keys(), 'gl-grafter', 'gl-app-owner', 'gl-partial-iac']) {
        const user = createEntity(UserEntity, {
            id: uuid(),
            gitlabUserId,
            username: gitlabUserId,
            name: gitlabUserId,
            avatarUrl: null,
            gitlabSession:
                gitlabUserId === 'gl-app-owner'
                    ? {
                          accessToken: 'test-access-token',
                          refreshToken: 'test-refresh-token',
                          expiresAt: Date.now() + 3_600_000,
                          authorizationVersion: 1,
                          redirectUri: 'https://dag.local/login'
                      }
                    : null,
            lastLoginAt: new Date()
        });
        await user.save();
        tokens[gitlabUserId] = await JWT.generate({ subject: user.id });
    }
}

function auth(gitlabUserId: string): Record<string, string> {
    return { authorization: `Bearer ${tokens[gitlabUserId]}` };
}

function environmentBody(overrides: Record<string, unknown> = {}) {
    return {
        name: 'staging',
        branch: 'develop',
        iacId,
        iacPath: 'charts/my-app-staging',
        iacBranch: null,
        clusterId,
        helmType: 'flux',
        helmNamespace: 'default',
        helmName: 'my-app-staging',
        ...overrides
    };
}

describe('GitLab-derived permissions', () => {
    it('rejects unauthenticated requests', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', {});
        assert.equal(response.statusCode, 401);
    });

    it('rejects a bogus token', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', { authorization: 'Bearer not-a-jwt' });
        assert.equal(response.statusCode, 401);
    });

    it('hides apps whose IaC repo the user cannot read', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-none'));
        assert.equal(response.statusCode, 200);
        assert.deepEqual(JSON.parse(response.bodyString), []);
    });

    it('404s an app the user cannot read, rather than 403ing and confirming it exists', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', `/api/apps/${appId}`, auth('gl-none'));
        assert.equal(response.statusCode, 404);
    });

    it('shows the app to a reporter, but not as manageable', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-reporter'));
        assert.equal(response.statusCode, 200);

        const apps = JSON.parse(response.bodyString);
        assert.equal(apps.length, 1);
        assert.equal(apps[0].id, appId);
        assert.equal(apps[0].canManage, false);
    });

    it('shows apps and deployments to source-repo owners without IaC access', async () => {
        const deployment = createEntity(DeploymentEntity, {
            id: uuid(),
            appEnvironmentId: environmentId,
            ciJobId: '12345',
            version: '1.2.3',
            commitSha: null,
            sourceCommitSha: 'abc123',
            statusMessage: null
        });
        await deployment.save();

        const appsResponse = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-app-owner'));
        assert.equal(appsResponse.statusCode, 200);
        const apps = JSON.parse(appsResponse.bodyString);
        assert.equal(apps.length, 1);
        assert.equal(apps[0].id, appId);
        assert.equal(apps[0].environmentCount, 1);
        assert.equal(apps[0].canManage, false);

        const deploymentsResponse = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/deployments', auth('gl-app-owner'));
        assert.equal(deploymentsResponse.statusCode, 200);
        const deployments = JSON.parse(deploymentsResponse.bodyString);
        assert.equal(deployments.length, 1);
        assert.equal(deployments[0].id, deployment.id);
    });

    it('shows IaC-only readers only the environments backed by repos they can read', async () => {
        const hiddenEnvironment = createEntity(AppEnvironmentEntity, {
            appId,
            branch: 'hidden',
            name: 'hidden',
            iacId: attackerIacId,
            iacPath: 'charts/my-app-hidden',
            clusterId,
            helmType: 'flux',
            helmNamespace: 'default',
            helmName: 'my-app-hidden',
            iacBranch: null
        });
        await hiddenEnvironment.save();

        const response = await TestingHelpers.makeMockRequest(tf, 'GET', `/api/apps/${appId}`, auth('gl-partial-iac'));
        assert.equal(response.statusCode, 200);

        const app = JSON.parse(response.bodyString);
        assert.equal(app.environmentCount, 1);
        assert.deepEqual(
            app.environments.map((environment: { id: number }) => environment.id),
            [environmentId]
        );
    });

    it('invalidates source and IaC permission caches on logout', async () => {
        const cacheKey = 'gl-app-owner|org/my-app';
        const userBefore = await UserEntity.query().filter({ gitlabUserId: 'gl-app-owner' }).findOne();
        const versionBefore = userBefore.gitlabSession!.authorizationVersion ?? 0;
        const initial = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-app-owner'));
        assert.equal(JSON.parse(initial.bodyString).length, 1);

        ACCESS_BY_USER_AND_PATH.set(cacheKey, 'none');
        try {
            // The old grant remains until logout explicitly invalidates it.
            const cached = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-app-owner'));
            assert.equal(JSON.parse(cached.bodyString).length, 1);

            const logout = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/session/logout', auth('gl-app-owner'), {});
            assert.equal(logout.statusCode, 200);
            const userAfter = await UserEntity.query().filter({ gitlabUserId: 'gl-app-owner' }).findOne();
            assert.ok((userAfter.gitlabSession!.authorizationVersion ?? 0) > versionBefore);

            const refreshed = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-app-owner'));
            assert.deepEqual(JSON.parse(refreshed.bodyString), []);
        } finally {
            ACCESS_BY_USER_AND_PATH.set(cacheKey, 'reporter');
            await TestingHelpers.makeMockRequest(tf, 'POST', '/api/session/logout', auth('gl-app-owner'), {});
        }
    });

    it('shows the app to a maintainer as manageable', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/apps', auth('gl-maintainer'));
        const apps = JSON.parse(response.bodyString);
        assert.equal(apps.length, 1);
        assert.equal(apps[0].canManage, true);
    });

    it('refuses to let a reporter edit the app', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'PUT', `/api/apps/${appId}`, auth('gl-reporter'), {
            name: 'renamed',
            gitProvider: 'gitlab',
            repoUrl: 'https://gitlab.example.com/org/my-app'
        });
        assert.equal(response.statusCode, 403);
    });

    it('refuses to let a reporter add an environment', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', `/api/apps/${appId}/environments`, auth('gl-reporter'), environmentBody());
        assert.equal(response.statusCode, 403);
    });

    it('lets a maintainer add an environment', async () => {
        const response = await TestingHelpers.makeMockRequest(
            tf,
            'POST',
            `/api/apps/${appId}/environments`,
            auth('gl-maintainer'),
            environmentBody({ name: 'staging-ok', branch: 'staging-ok' })
        );
        assert.equal(response.statusCode, 200);

        const environment = JSON.parse(response.bodyString);
        assert.equal(environment.name, 'staging-ok');
        assert.equal(environment.iacName, 'prod-iac');
        assert.equal(environment.clusterName, 'prod-1');
    });

    it('refuses to let a reader graft an environment onto an app they only read', async () => {
        // gl-grafter is a reporter on the app's IaC repo but a maintainer on their own. Managing
        // the target repo must not be enough to add an environment to an app they don't manage —
        // otherwise they could strip the real owners' rights and break the app's deploys.
        const response = await TestingHelpers.makeMockRequest(
            tf,
            'POST',
            `/api/apps/${appId}/environments`,
            auth('gl-grafter'),
            environmentBody({ name: 'grafted', branch: 'grafted', iacId: attackerIacId })
        );
        assert.equal(response.statusCode, 403);
    });

    it('refuses to delete the only environment of an app', async () => {
        // Removing it would leave an app nobody could see, since visibility is derived from the
        // IaC repos its environments point at.
        // Only GET is bodyless in makeMockRequest, so DELETE needs the explicit headers+body form
        // or the headers get parsed as the body and the request goes out unauthenticated.
        const response = await TestingHelpers.makeMockRequest(
            tf,
            'DELETE',
            `/api/apps/${appId}/environments/${environmentId}`,
            auth('gl-maintainer'),
            {}
        );
        assert.equal(response.statusCode, 400);
    });

    it('gates clusters behind manage on at least one IaC repo', async () => {
        const forbidden = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/clusters', auth('gl-reporter'));
        assert.equal(forbidden.statusCode, 403);

        const allowed = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/clusters', auth('gl-maintainer'));
        assert.equal(allowed.statusCode, 200);
    });

    it('keeps a stored CA cert when a cluster is edited without resupplying it', async () => {
        // gl-maintainer is an operator (maintainer on prod-iac).
        const created = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/clusters', auth('gl-maintainer'), {
            name: 'has-cert',
            apiUrl: 'https://k8s.example.com:6443',
            serviceAccountToken: 'sa-token',
            caCert: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'
        });
        assert.equal(created.statusCode, 200);
        const { id } = JSON.parse(created.bodyString);
        assert.equal(JSON.parse(created.bodyString).hasCaCert, true);

        // Rename only — no caCert, no token in the body, as the UI sends for an untouched field.
        const updated = await TestingHelpers.makeMockRequest(tf, 'PUT', `/api/clusters/${id}`, auth('gl-maintainer'), {
            name: 'renamed',
            apiUrl: 'https://k8s.example.com:6443'
        });
        assert.equal(updated.statusCode, 200);

        const after = JSON.parse((await TestingHelpers.makeMockRequest(tf, 'GET', '/api/clusters', auth('gl-maintainer'))).bodyString);
        const cluster = after.find((c: { id: number }) => c.id === id);
        assert.equal(cluster.name, 'renamed');
        assert.equal(cluster.hasCaCert, true);
    });

    it('never returns cluster credentials', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/clusters', auth('gl-maintainer'));
        assert.equal(response.statusCode, 200);
        assert.ok(!response.bodyString.includes('test-token'), 'serviceAccountToken leaked in the cluster response');
    });

    it('never returns IaC access tokens, and reports the caller’s own role', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/iacs', auth('gl-reporter'));
        assert.equal(response.statusCode, 200);
        assert.ok(!response.bodyString.includes('test-access-token'), 'accessToken leaked in the IaC response');
        assert.ok(!response.bodyString.includes('attacker-token'), 'accessToken leaked in the IaC response');

        const iacs = JSON.parse(response.bodyString);
        const prodIac = iacs.find((iac: { name: string }) => iac.name === 'prod-iac');
        assert.equal(prodIac.role, 'read');
    });

    it('hides IaC repos the user has no access to', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/iacs', auth('gl-none'));
        assert.deepEqual(JSON.parse(response.bodyString), []);
    });

    it('encrypts GitLab session tokens at rest and can decrypt them for use', async () => {
        const gitlab = tf.app.get(GitLabService);
        const session = gitlab.buildSession(
            { accessToken: 'raw-access', refreshToken: 'raw-refresh', expiresAt: Date.now() + 3_600_000 },
            'https://dag.local/login'
        );

        // Stored form must not be the plaintext token.
        assert.ok(session.accessToken.startsWith('enc:'), 'access token stored unencrypted');
        assert.ok(session.refreshToken.startsWith('enc:'), 'refresh token stored unencrypted');
        assert.ok(!session.accessToken.includes('raw-access'));
        assert.ok(!session.refreshToken.includes('raw-refresh'));
        assert.ok((session.authorizationVersion ?? 0) > 0, 'login sessions must invalidate older permission caches');

        // ...but is recoverable at point of use.
        assert.equal(decryptValue(session.accessToken), 'raw-access');
        assert.equal(decryptValue(session.refreshToken), 'raw-refresh');
    });

    it('scopes the deployment list to readable environments', async () => {
        const hidden = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/deployments', auth('gl-none'));
        assert.equal(hidden.statusCode, 200);
        assert.deepEqual(JSON.parse(hidden.bodyString), []);

        const visible = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/deployments', auth('gl-reporter'));
        assert.equal(visible.statusCode, 200);
    });
});
