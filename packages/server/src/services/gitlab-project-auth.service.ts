import { ScopedLogger } from '@zyno-io/ts-server-foundation';

import { AppConfig } from '../config';
import { UserEntity } from '../entities/user.entity';
import { gitlabProjectPath, GitLabService, ProjectAccessLevel } from './gitlab.service';

const ACCESS_RANK: Record<ProjectAccessLevel, number> = {
    none: 0,
    guest: 1,
    reporter: 2,
    developer: 3,
    maintainer: 4,
    owner: 5
};

interface CacheEntry {
    level: ProjectAccessLevel;
    expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 1000;

/**
 * Resolves a user's effective access to any project on the configured GitLab instance.
 * Source repositories and IaC repositories share this cache so re-authentication can refresh
 * every grant in one operation.
 */
export class GitLabProjectAuthService {
    private cache = new Map<string, CacheEntry>();
    private inFlight = new Map<string, Promise<ProjectAccessLevel>>();

    constructor(
        private gitlab: GitLabService,
        private config: AppConfig,
        private logger: ScopedLogger
    ) {}

    async getAccessLevel(user: UserEntity, repoUrl: string): Promise<ProjectAccessLevel> {
        const projectPath = gitlabProjectPath(repoUrl, this.config.GITLAB_URL);
        if (!projectPath) {
            this.logger.warn(`Repository ${repoUrl} is not on ${this.config.GITLAB_URL}; denying access`);
            return 'none';
        }

        // The version is persisted inside the GitLab session, so login/logout invalidation also
        // takes effect when a later request lands on another server replica.
        const cacheKey = `${user.id}|${user.gitlabSession?.authorizationVersion ?? 0}|${projectPath}`;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, cached);
            return cached.level;
        }

        const existingRequest = this.inFlight.get(cacheKey);
        if (existingRequest) return existingRequest;

        const request = this.resolveAndCache(user, projectPath, cacheKey);
        this.inFlight.set(cacheKey, request);
        try {
            return await request;
        } finally {
            if (this.inFlight.get(cacheKey) === request) this.inFlight.delete(cacheKey);
        }
    }

    async hasAccess(user: UserEntity, repoUrl: string, minimum: Exclude<ProjectAccessLevel, 'none'>): Promise<boolean> {
        const level = await this.getAccessLevel(user, repoUrl);
        return ACCESS_RANK[level] >= ACCESS_RANK[minimum];
    }

    /** Drop every cached source and IaC grant for a user. */
    invalidateUser(userId: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${userId}|`)) this.cache.delete(key);
        }
    }

    private async resolveAndCache(user: UserEntity, projectPath: string, cacheKey: string): Promise<ProjectAccessLevel> {
        const level = await this.gitlab.getProjectAccessLevel(user, projectPath);

        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, { level, expiresAt: Date.now() + CACHE_TTL_MS });
        if (this.cache.size > CACHE_MAX_ENTRIES) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }

        return level;
    }
}
