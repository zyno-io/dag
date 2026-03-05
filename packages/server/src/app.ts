import { createApp as createBaseApp, CreateAppOptions } from '@zyno-io/dk-server-foundation';

import { AppConfig } from './config';
import { DB } from './database';
import { DeployController } from './controllers/deploy.controller';
import { GetController } from './controllers/get.controller';
import { AppAuthService } from './services/app-auth.service';
import { ChartService } from './services/chart.service';
import { DeploymentService } from './services/deployment.service';
import { GitProviderService } from './services/git-provider.service';
import { IacRepoService } from './services/iac-repo.service';
import { K8sMonitorService } from './services/k8s-monitor.service';
import { DeploymentLifecycleListener } from './services/deployment-lifecycle.listener';

export const CoreAppOptions: CreateAppOptions<AppConfig> = {
    config: AppConfig,
    db: DB,

    controllers: [DeployController, GetController],
    providers: [AppAuthService, ChartService, DeploymentService, GitProviderService, IacRepoService, K8sMonitorService, DeploymentLifecycleListener],
    listeners: [DeploymentLifecycleListener]
};

export const createApp = () => createBaseApp(CoreAppOptions);
