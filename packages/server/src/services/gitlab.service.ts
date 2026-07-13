import { HttpBadRequestError, persistEntity, ScopedLogger } from '@zyno-io/ts-server-foundation';

import { AppConfig } from '../config';
import { Db } from '../database';
import { IGitLabSession, UserEntity } from '../entities/user.entity';
import { decryptValue, encryptValue } from '../helpers/crypto';

export type ProjectAccessLevel = 'none' | 'guest' | 'reporter' | 'developer' | 'maintainer' | 'owner';

const GITLAB_ACCESS_LEVELS: { min: number; level: ProjectAccessLevel }[] = [
    { min: 50, level: 'owner' },
    { min: 40, level: 'maintainer' },
    { min: 30, level: 'developer' },
    { min: 20, level: 'reporter' },
    { min: 10, level: 'guest' }
];

export interface GitLabIdentity {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
}

export interface GitLabTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

/** Refresh an access token once it is within this window of expiring. */
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

/**
 * Derive a GitLab project path ("group/project") from a repo URL. Returns null when the
 * URL does not belong to the configured GitLab instance, in which case no access level
 * can be resolved for it.
 */
export function gitlabProjectPath(repoUrl: string, gitlabUrl: string): string | null {
    const base = gitlabUrl.replace(/\/+$/, '');
    const normalized = repoUrl.replace(/\/+$/, '').replace(/\.git$/i, '');

    if (!normalized.startsWith(`${base}/`)) return null;

    const path = normalized.slice(base.length + 1);
    return path || null;
}

export class GitLabService {
    constructor(
        private config: AppConfig,
        private db: Db,
        private logger: ScopedLogger
    ) {}

    get baseUrl(): string {
        return this.config.GITLAB_URL.replace(/\/+$/, '');
    }

    private get credentials(): { clientId: string; clientSecret: string } {
        const clientId = this.config.GITLAB_OAUTH_CLIENT_ID;
        const clientSecret = this.config.GITLAB_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new HttpBadRequestError('GitLab OAuth is not configured; set GITLAB_OAUTH_CLIENT_ID and GITLAB_OAUTH_CLIENT_SECRET');
        }
        return { clientId, clientSecret };
    }

    getLoginUrl(redirectUri: string, state: string): string {
        const params = new URLSearchParams({
            client_id: this.credentials.clientId,
            redirect_uri: redirectUri,
            state,
            response_type: 'code',
            scope: 'read_api'
        });
        return `${this.baseUrl}/oauth/authorize?${params}`;
    }

    async exchangeCode(redirectUri: string, code: string): Promise<GitLabTokens> {
        const { clientId, clientSecret } = this.credentials;
        return this.requestTokens(
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code,
                grant_type: 'authorization_code'
            })
        );
    }

    /**
     * Resolve the identity of whoever the access token belongs to. The token came straight
     * from GitLab's token endpoint over TLS, authenticated with our client secret, so it is
     * trustworthy without also verifying an id_token.
     */
    async getIdentity(accessToken: string): Promise<GitLabIdentity> {
        const response = await fetch(`${this.baseUrl}/api/v4/user`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new HttpBadRequestError(`GitLab rejected the access token (${response.status})`);
        }

        const user = (await response.json()) as { id?: number; username?: string; name?: string; avatar_url?: string | null };
        if (!user.id || !user.username) {
            throw new HttpBadRequestError('GitLab user response is missing id or username');
        }

        return {
            id: String(user.id),
            username: user.username,
            name: user.name || user.username,
            avatarUrl: user.avatar_url ?? null
        };
    }

    /**
     * The user's effective access level on a project, as GitLab sees it. Asking with the
     * *user's own* token means group inheritance, subgroups and shared projects are all
     * accounted for by GitLab rather than reimplemented here.
     */
    async getProjectAccessLevel(user: UserEntity, projectPath: string): Promise<ProjectAccessLevel> {
        const accessToken = await this.accessTokenFor(user);

        const response = await fetch(`${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectPath)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // 403/404 both mean "not visible to this user", which is a legitimate 'none'.
        // Anything else is a real GitLab failure and must not be silently downgraded to
        // no-access, or a GitLab outage would look like a permissions revocation.
        if (response.status === 403 || response.status === 404) return 'none';
        if (!response.ok) {
            throw new Error(`GitLab returned ${response.status} resolving access to ${projectPath}`);
        }

        const project = (await response.json()) as {
            permissions?: {
                project_access?: { access_level?: number } | null;
                group_access?: { access_level?: number } | null;
            } | null;
        };

        const level = Math.max(project.permissions?.project_access?.access_level ?? 0, project.permissions?.group_access?.access_level ?? 0);

        for (const { min, level: name } of GITLAB_ACCESS_LEVELS) {
            if (level >= min) return name;
        }
        return 'none';
    }

    /** A valid access token for this user, refreshing it first if it is about to expire. */
    private async accessTokenFor(user: UserEntity): Promise<string> {
        if (!user.gitlabSession) throw new HttpBadRequestError('User has no GitLab session');
        if (user.gitlabSession.expiresAt > Date.now() + TOKEN_REFRESH_LEEWAY_MS) {
            return decryptValue(user.gitlabSession.accessToken);
        }
        return this.refresh(user);
    }

    /**
     * Package fresh OAuth tokens into a session for persistence, with the access and refresh
     * tokens encrypted at rest — they are `read_api`-scoped, so a leaked database row would otherwise
     * let anyone impersonate the user against GitLab.
     */
    buildSession(tokens: GitLabTokens, redirectUri: string): IGitLabSession {
        return {
            accessToken: encryptValue(tokens.accessToken),
            refreshToken: encryptValue(tokens.refreshToken),
            expiresAt: tokens.expiresAt,
            authorizationVersion: Date.now(),
            redirectUri
        };
    }

    private async refresh(user: UserEntity): Promise<string> {
        const { clientId, clientSecret } = this.credentials;

        return this.db.transaction(async session => {
            // Serialize concurrent refreshes for one user: GitLab rotates the refresh token
            // on use, so two racing refreshes would leave one of them holding a dead token.
            await session.acquireSessionLock(['dag', 'gitlab-refresh', user.id]);

            const latest = await session.query(UserEntity).filter({ id: user.id }).findOne();
            if (!latest.gitlabSession) throw new HttpBadRequestError('User has no GitLab session');

            // Another request refreshed it while we waited for the lock.
            if (latest.gitlabSession.expiresAt > Date.now() + TOKEN_REFRESH_LEEWAY_MS) {
                user.gitlabSession = latest.gitlabSession;
                return decryptValue(latest.gitlabSession.accessToken);
            }

            this.logger.info(`Refreshing GitLab token for user ${latest.id}`);

            const tokens = await this.requestTokens(
                new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: decryptValue(latest.gitlabSession.refreshToken),
                    redirect_uri: latest.gitlabSession.redirectUri
                })
            );

            latest.gitlabSession = this.buildSession(tokens, latest.gitlabSession.redirectUri);
            await persistEntity(latest, session);
            user.gitlabSession = latest.gitlabSession;
            return tokens.accessToken;
        });
    }

    private async requestTokens(body: URLSearchParams): Promise<GitLabTokens> {
        const response = await fetch(`${this.baseUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });

        if (!response.ok) {
            throw new HttpBadRequestError(`GitLab rejected the token request (${response.status})`);
        }

        const tokens = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
        if (!tokens.access_token || !tokens.refresh_token) {
            throw new HttpBadRequestError('GitLab token response is missing tokens');
        }

        return {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in ?? 7200) * 1000
        };
    }
}
