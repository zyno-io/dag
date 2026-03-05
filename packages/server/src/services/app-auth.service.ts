import { HttpNotFoundError, HttpUnauthorizedError } from '@deepkit/http';
import { ScopedLogger } from '@deepkit/logger';

import { JobTokenVerificationError } from '../errors';
import { AppEntity } from '../entities/app.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
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

    async authenticateAndResolve(repoUrl: string, jobId: string, jobToken: string): Promise<AppAuthResult> {
        // Normalize repo URL (remove trailing slash)
        const normalizedUrl = repoUrl.replace(/\/+$/, '');

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
        const appEnvironment = await AppEnvironmentEntity.query().filterField('appId', app.id).filterField('branch', branch).findOneOrUndefined();

        if (!appEnvironment) {
            throw new HttpNotFoundError(`No environment configuration found for ${normalizedUrl}:${branch}`);
        }

        return { app, appEnvironment, branch, commitSha };
    }
}
