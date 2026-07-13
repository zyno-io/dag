import { createApp as createBaseApp, CreateAppOptions } from '@zyno-io/ts-server-foundation';

import { AppConfig } from './config';
import { ApiFallbackController } from './controllers/api-fallback.controller';
import { AppsController } from './controllers/apps.controller';
import { ClustersController } from './controllers/clusters.controller';
import { DeployController } from './controllers/deploy.controller';
import { DeploymentsController } from './controllers/deployments.controller';
import { EnvironmentsController } from './controllers/environments.controller';
import { GetController } from './controllers/get.controller';
import { IacsController } from './controllers/iacs.controller';
import { SessionController } from './controllers/session.controller';
import { Db } from './database';
import { AppAccessService } from './services/app-access.service';
import { AppAuthService } from './services/app-auth.service';
import { ChartService } from './services/chart.service';
import { DeploymentLifecycleListener } from './services/deployment-lifecycle.listener';
import { DeploymentService } from './services/deployment.service';
import { GitProviderService } from './services/git-provider.service';
import { GitLabProjectAuthService } from './services/gitlab-project-auth.service';
import { GitLabService } from './services/gitlab.service';
import { IacAuthService } from './services/iac-auth.service';
import { IacRepoService } from './services/iac-repo.service';
import { K8sMonitorService } from './services/k8s-monitor.service';

export const CoreAppOptions: CreateAppOptions<AppConfig> = {
    config: AppConfig,
    db: Db,

    // The management UI is built into ./static and served from the same origin as the API,
    // falling back to index.html for client-side routes.
    staticFiles: true,

    controllers: [
        DeployController,
        GetController,
        SessionController,
        AppsController,
        EnvironmentsController,
        DeploymentsController,
        ClustersController,
        IacsController,
        // Must stay last: it claims any unmatched GET under /api, and the router returns the
        // first registered match.
        ApiFallbackController
    ],
    providers: [
        AppAccessService,
        AppAuthService,
        ChartService,
        DeploymentService,
        GitLabProjectAuthService,
        GitLabService,
        GitProviderService,
        IacAuthService,
        IacRepoService,
        K8sMonitorService,
        DeploymentLifecycleListener
    ],
    listeners: [DeploymentLifecycleListener]
};

export const createApp = () => createBaseApp(CoreAppOptions);
