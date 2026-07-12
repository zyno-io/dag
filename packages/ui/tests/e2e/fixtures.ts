import type {
    IAppDetailResponse,
    IAppResponse,
    IClusterResponse,
    IDeploymentResponse,
    IEnvironmentResponse,
    IIacResponse,
    ISessionResponse
} from '../../src/openapi-client-generated';

// Frozen wall-clock used by page.clock.install + every timestamp below, so relative times
// ("2 hours ago") render identically on every run.
export const VRT_NOW = new Date('2026-04-01T15:00:00.000Z').getTime();

const APP_ID = 1;

export const ids = { appId: APP_ID, deploymentId: '018f0000-0000-7000-8000-0000000000a1' };

export const sessionUser: ISessionResponse = {
    id: 'usr-aaaa-bbbb-cccc-dddd',
    name: 'Casey Tester',
    username: 'casey',
    avatarUrl: null
};

export const iacs: IIacResponse[] = [
    {
        id: 1,
        name: 'prod-infra',
        repoUrl: 'https://gitlab.example.com/acme/prod-infra',
        role: 'manage',
        createdAt: '2025-09-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
    },
    {
        id: 2,
        name: 'staging-infra',
        repoUrl: 'https://gitlab.example.com/acme/staging-infra',
        role: 'read',
        createdAt: '2025-09-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z'
    }
];

export const clusters: IClusterResponse[] = [
    {
        id: 1,
        name: 'prod-eu',
        apiUrl: 'https://prod-eu.k8s.example.com:6443',
        hasCaCert: true,
        environmentCount: 2,
        createdAt: '2025-09-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
    },
    {
        id: 2,
        name: 'staging',
        apiUrl: 'https://staging.k8s.example.com:6443',
        hasCaCert: false,
        environmentCount: 1,
        createdAt: '2025-09-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z'
    }
];

export const apps: IAppResponse[] = [
    {
        id: APP_ID,
        name: 'checkout-service',
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/acme/checkout-service',
        environmentCount: 2,
        canManage: true,
        createdAt: '2025-09-01T10:00:00.000Z',
        updatedAt: '2026-03-30T18:21:00.000Z'
    },
    {
        id: 2,
        name: 'billing-api',
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/acme/billing-api',
        environmentCount: 1,
        canManage: false,
        createdAt: '2025-10-12T08:14:00.000Z',
        updatedAt: '2026-03-29T22:08:00.000Z'
    },
    {
        id: 3,
        name: 'web-frontend',
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/acme/web-frontend',
        environmentCount: 3,
        canManage: true,
        createdAt: '2025-11-04T14:51:00.000Z',
        updatedAt: '2026-03-28T11:42:00.000Z'
    }
];

const environments: IEnvironmentResponse[] = [
    {
        id: 1,
        appId: APP_ID,
        name: 'production',
        branch: 'main',
        iacId: 1,
        iacName: 'prod-infra',
        iacPath: 'charts/checkout-service',
        iacBranch: null,
        clusterId: 1,
        clusterName: 'prod-eu',
        helmType: 'flux',
        helmNamespace: 'checkout',
        helmName: 'checkout-service',
        canManage: true,
        createdAt: '2025-09-01T10:00:00.000Z',
        updatedAt: '2026-03-30T18:21:00.000Z'
    },
    {
        id: 2,
        appId: APP_ID,
        name: 'staging',
        branch: 'develop',
        iacId: 2,
        iacName: 'staging-infra',
        iacPath: 'charts/checkout-service',
        iacBranch: 'main',
        clusterId: 2,
        clusterName: 'staging',
        helmType: 'plain',
        helmNamespace: 'checkout-staging',
        helmName: 'checkout-service',
        // Read-only on staging-infra, so this environment's edit controls stay hidden.
        canManage: false,
        createdAt: '2025-09-02T10:00:00.000Z',
        updatedAt: '2026-03-29T22:08:00.000Z'
    }
];

export const appDetail: IAppDetailResponse = {
    ...apps[0],
    environments
};

export const deployments: IDeploymentResponse[] = [
    {
        id: ids.deploymentId,
        appId: APP_ID,
        appName: 'checkout-service',
        environmentId: 1,
        environmentName: 'production',
        branch: 'main',
        version: '1.4.2',
        status: 'deployed',
        statusMessage: 'HelmRelease reconciled successfully',
        ciJobId: '48213',
        jobUrl: 'https://gitlab.example.com/acme/checkout-service/-/jobs/48213',
        commitUrl: 'https://gitlab.example.com/acme/prod-infra/-/commit/deadbeefcafe',
        sourceCommitSha: 'feedface12345678',
        createdAt: '2026-03-30T18:19:00.000Z',
        updatedAt: '2026-03-30T18:21:00.000Z'
    },
    {
        id: '018f0000-0000-7000-8000-0000000000a2',
        appId: 2,
        appName: 'billing-api',
        environmentId: 3,
        environmentName: 'production',
        branch: 'main',
        version: '2.7.0',
        status: 'monitoring',
        statusMessage: 'Waiting for HelmRelease to become ready',
        ciJobId: '48210',
        jobUrl: 'https://gitlab.example.com/acme/billing-api/-/jobs/48210',
        commitUrl: null,
        sourceCommitSha: 'abcdef01234567',
        createdAt: '2026-04-01T14:58:00.000Z',
        updatedAt: '2026-04-01T14:59:00.000Z'
    },
    {
        id: '018f0000-0000-7000-8000-0000000000a3',
        appId: 3,
        appName: 'web-frontend',
        environmentId: 4,
        environmentName: 'staging',
        branch: 'develop',
        version: '5.1.0-rc3',
        status: 'failed',
        statusMessage: 'Timed out waiting for HelmRelease after 300s',
        ciJobId: '48190',
        jobUrl: 'https://gitlab.example.com/acme/web-frontend/-/jobs/48190',
        commitUrl: 'https://gitlab.example.com/acme/prod-infra/-/commit/0badc0de',
        sourceCommitSha: '99887766',
        createdAt: '2026-03-28T11:40:00.000Z',
        updatedAt: '2026-03-28T11:45:30.000Z'
    }
];

export const deploymentDetail = deployments[0];

/** A deployment still in flight — used to render the live view's "Live" banner + timeline. */
export const liveDeployment: IDeploymentResponse = {
    ...deployments[1],
    id: '018f0000-0000-7000-8000-0000000000b1'
};
