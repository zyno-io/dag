import { createApp as createBaseApp, CreateAppOptions } from '@zyno-io/ts-server-foundation';

import { AppConfig } from './config';
import { DeployController } from './controllers/deploy.controller';
import { GetController } from './controllers/get.controller';
import { Db } from './database';
import { AppAuthService } from './services/app-auth.service';
import { ChartService } from './services/chart.service';
import { DeploymentLifecycleListener } from './services/deployment-lifecycle.listener';
import { DeploymentService } from './services/deployment.service';
import { GitProviderService } from './services/git-provider.service';
import { IacRepoService } from './services/iac-repo.service';
import { K8sMonitorService } from './services/k8s-monitor.service';

export const CoreAppOptions: CreateAppOptions<AppConfig> = {
    config: AppConfig,
    db: Db,

    controllers: [DeployController, GetController],
    providers: [AppAuthService, ChartService, DeploymentService, GitProviderService, IacRepoService, K8sMonitorService, DeploymentLifecycleListener],
    listeners: [DeploymentLifecycleListener]
};

export const createApp = () => createBaseApp(CoreAppOptions);
