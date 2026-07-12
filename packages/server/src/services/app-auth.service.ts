import { HttpBadRequestError, HttpNotFoundError, HttpUnauthorizedError, ScopedLogger } from '@zyno-io/ts-server-foundation';

import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
import { JobTokenVerificationError } from '../errors';
import { GitProviderService } from './git-provider.service';

export interface AppAuthResult {
    app: AppEntity;
    appEnvironment: AppEnvironmentEntity;
    branch: string;
    commitSha: string;
}

export class AppAuthService {
    constructor(
        private gitProviderService: GitProviderService,
        private logger: ScopedLogger
    ) {}

    async authenticateAndResolve(repoUrl: string, jobId: string, jobToken: string, environment?: string): Promise<AppAuthResult> {
        // Normalize repo URL (remove trailing slash)
        const normalizedUrl = repoUrl.replace(/\/+$/, '');
        const environmentName = environment?.trim() || undefined;

        // Find matching app
        const app = await AppEntity.query().filterField('repoUrl', normalizedUrl).findOneOrUndefined();

        if (!app) {
            throw new HttpNotFoundError(`No app configured for repo: ${normalizedUrl}`);
        }

        // Verify job token and get branch + source commit
        let branch: string;
        let commitSha: string;
        try {
            const result = await this.gitProviderService.verifyJobAndGetBranch(app.gitProvider, normalizedUrl, jobId, jobToken);
            branch = result.branch;
            commitSha = result.commitSha;
        } catch (err) {
            if (err instanceof JobTokenVerificationError) {
                this.logger.warn(`Job token verification failed for ${normalizedUrl} job ${jobId}: ${err.message}`);
                throw new HttpUnauthorizedError(err.message);
            }
            throw err;
        }

        // Find matching environment config
        const appEnvironments = await AppEnvironmentEntity.query().filterField('appId', app.id).filterField('branch', branch).find();
        const appEnvironment = environmentName ? appEnvironments.find(env => env.name === environmentName) : appEnvironments[0];

        if (!appEnvironment) {
            const target = environmentName ? `${normalizedUrl}:${branch}:${environmentName}` : `${normalizedUrl}:${branch}`;
            throw new HttpNotFoundError(`No environment configuration found for ${target}`);
        }

        if (!environmentName && appEnvironments.length > 1) {
            throw new HttpBadRequestError(
                `Multiple environment configurations found for ${normalizedUrl}:${branch}; pass an environment to select one`
            );
        }

        return { app, appEnvironment, branch, commitSha };
    }
}
