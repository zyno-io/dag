import { HttpAccessDeniedError, ScopedLogger } from '@zyno-io/ts-server-foundation';

import { AppConfig } from '../config';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { gitlabProjectPath, GitLabService, ProjectAccessLevel } from './gitlab.service';

export type IacRole = 'read' | 'operate' | 'manage';

const ROLE_RANK: Record<ProjectAccessLevel, number> = {
    none: 0,
    guest: 1,
    reporter: 2,
    developer: 3,
    maintainer: 4,
    owner: 5
};

const ROLE_REQUIREMENT: Record<IacRole, ProjectAccessLevel> = {
    read: 'guest',
    operate: 'developer',
    manage: 'maintainer'
};

interface CacheEntry {
    level: ProjectAccessLevel;
    expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 1000;

/**
 * DAG has no local roles. What a user may do is decided entirely by their GitLab access to
 * the IaC repo an environment deploys into: the people who can change the infrastructure
 * repo are the people who may change what deploys into it.
 *
 * GitLab is asked once per user/repo and cached briefly, because this sits on every
 * app-scoped request.
 */
export class IacAuthService {
    // Map iteration order is insertion order — re-inserting a key on hit moves it to the
    // tail, so the head is the LRU entry; we evict from the head when we exceed the cap.
    private cache = new Map<string, CacheEntry>();

    constructor(
        private gitlab: GitLabService,
        private config: AppConfig,
        private logger: ScopedLogger
    ) {}

    async getAccessLevel(user: UserEntity, iac: IacEntity): Promise<ProjectAccessLevel> {
        const cacheKey = `${user.id}|${iac.id}`;
        const now = Date.now();

        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, cached);
            return cached.level;
        }

        const level = await this.resolveAccessLevel(user, iac);

        // delete-then-set so the key always lands at the tail, even when refreshing an expired entry
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, { level, expiresAt: now + CACHE_TTL_MS });

        if (this.cache.size > CACHE_MAX_ENTRIES) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }

        return level;
    }

    private async resolveAccessLevel(user: UserEntity, iac: IacEntity): Promise<ProjectAccessLevel> {
        const projectPath = gitlabProjectPath(iac.repoUrl, this.config.GITLAB_URL);
        if (!projectPath) {
            // An IaC repo hosted somewhere other than the configured GitLab instance can never
            // be authorized against it. Nobody gets access rather than everybody.
            this.logger.warn(`IaC repo ${iac.id} (${iac.repoUrl}) is not on ${this.config.GITLAB_URL}; denying all access`);
            return 'none';
        }
        return this.gitlab.getProjectAccessLevel(user, projectPath);
    }

    async hasRole(user: UserEntity, iac: IacEntity, role: IacRole): Promise<boolean> {
        const level = await this.getAccessLevel(user, iac);
        return ROLE_RANK[level] >= ROLE_RANK[ROLE_REQUIREMENT[role]];
    }

    async requireRole(user: UserEntity, iac: IacEntity, role: IacRole): Promise<ProjectAccessLevel> {
        const level = await this.getAccessLevel(user, iac);
        if (ROLE_RANK[level] < ROLE_RANK[ROLE_REQUIREMENT[role]]) {
            throw new HttpAccessDeniedError(`Insufficient GitLab permissions on IaC repo "${iac.name}" (have=${level}, need=${role})`);
        }
        return level;
    }

    /** The IaC repos this user holds at least `role` on. */
    async filterIacs(user: UserEntity, iacs: IacEntity[], role: IacRole): Promise<IacEntity[]> {
        const allowed = await Promise.all(iacs.map(iac => this.hasRole(user, iac, role)));
        return iacs.filter((_, i) => allowed[i]);
    }

    /**
     * Clusters hold Kubernetes credentials and are shared infrastructure, so they are not
     * scoped to a single IaC repo. Whoever can `manage` any IaC repo is, by construction,
     * the infra team — that is the gate.
     */
    async requireOperator(user: UserEntity): Promise<void> {
        const iacs = await IacEntity.query().find();
        for (const iac of iacs) {
            if (await this.hasRole(user, iac, 'manage')) return;
        }
        throw new HttpAccessDeniedError('Requires maintainer access to at least one IaC repository');
    }

    /** Drop cached grants for a user, e.g. once their GitLab session is replaced on re-login. */
    invalidateUser(userId: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${userId}|`)) this.cache.delete(key);
        }
    }
}
