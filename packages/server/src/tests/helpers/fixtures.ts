import { TestingHelpers } from '@zyno-io/dk-server-foundation';

import { AppEntity } from '../../entities/app.entity';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { IacEntity } from '../../entities/iac.entity';

export const appFixtures = TestingHelpers.defineEntityFixtures(AppEntity, {
    defaultApp: {
        gitProvider: 'gitlab',
        repoUrl: 'https://gitlab.example.com/org/my-app'
    }
});

export const clusterFixtures = TestingHelpers.defineEntityFixtures(ClusterEntity, {
    prodCluster: {
        name: 'prod-1',
        apiUrl: 'https://k8s.example.com:6443',
        serviceAccountToken: 'test-sa-token',
        caCert: null
    }
});

export const iacFixtures = TestingHelpers.defineEntityFixtures(IacEntity, {
    defaultIac: {
        name: 'prod-iac',
        repoUrl: 'https://gitlab.example.com/org/iac-repo.git',
        accessToken: 'test-access-token'
    }
});

export const appEnvironmentFixtures = TestingHelpers.defineEntityFixtures(AppEnvironmentEntity, {
    mainBranch: {
        appId: 0, // Set during test setup
        branch: 'main',
        iacId: 0, // Set during test setup
        iacPath: 'charts/my-app',
        clusterId: 0, // Set during test setup
        helmType: 'flux',
        helmNamespace: 'default',
        helmName: 'my-app',
        iacBranch: null
    }
});
