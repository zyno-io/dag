import { createApp as createBaseApp, CreateAppOptions } from '@zyno-io/dk-server-foundation';

import { AppConfig } from './config';
import { DB } from './database';
import { DeployController } from './controllers/deploy.controller';
import { ChartService } from './services/chart.service';
import { DeploymentService } from './services/deployment.service';
import { GitProviderService } from './services/git-provider.service';
import { IacRepoService } from './services/iac-repo.service';
import { K8sMonitorService } from './services/k8s-monitor.service';
import { DeploymentJob } from './services/deployment.job';

export const CoreAppOptions: CreateAppOptions<AppConfig> = {
    config: AppConfig,
    db: DB,
    enableWorker: true,

    controllers: [DeployController],
    providers: [ChartService, DeploymentService, GitProviderService, IacRepoService, K8sMonitorService, DeploymentJob]
};

export const createApp = () => createBaseApp(CoreAppOptions);
