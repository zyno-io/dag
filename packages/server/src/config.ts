import { BaseAppConfig } from '@zyno-io/ts-server-foundation';

export class AppConfig extends BaseAppConfig {
    DATA_DIR: string = '/tmp/dag';
    DEPLOY_MONITOR_TIMEOUT_SECS: number = 300;

    /** Base URL of the GitLab instance users log in with, and which hosts the IaC repos. */
    GITLAB_URL: string = 'https://gitlab.com';
    GITLAB_OAUTH_CLIENT_ID?: string;
    GITLAB_OAUTH_CLIENT_SECRET?: string;

    /** Public origin this server is reached on; OAuth redirects must land here. */
    PUBLIC_BASE_URL: string = 'http://localhost:3000';
    /** Extra comma-separated origins allowed as OAuth redirect targets (e.g. the Vite dev server). */
    OAUTH_REDIRECT_ORIGINS?: string;
}
