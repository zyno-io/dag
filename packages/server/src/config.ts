import { BaseAppConfig } from '@zyno-io/dk-server-foundation';

export class AppConfig extends BaseAppConfig {
    DATA_DIR: string = '/tmp/dag';
    DEPLOY_MONITOR_TIMEOUT_SECS: number = 300;
}
