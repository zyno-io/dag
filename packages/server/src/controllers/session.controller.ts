import {
    createPersistedEntity,
    http,
    HttpBadRequestError,
    HttpBody,
    HttpQueries,
    HttpRequest,
    HttpResponse,
    HttpUnauthorizedError,
    JWT,
    persistEntity,
    uuid
} from '@zyno-io/ts-server-foundation';
import { randomBytes } from 'node:crypto';

import { ApiController } from '../accessories/controller.accessory';
import { AppConfig } from '../config';
import { Db } from '../database';
import { UserEntity } from '../entities/user.entity';
import { GitLabService } from '../services/gitlab.service';
import { IacAuthService } from '../services/iac-auth.service';

interface ISessionResponse {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
}

interface ISessionStatusResponse {
    isConfigured: boolean;
}

interface ISessionLoginRequest {
    code: string;
    state: string;
}

interface ISessionLoginResponse {
    jwt: string;
    returnPath: string;
}

interface IOAuthStatePayload {
    nonce: string;
    redirectUri: string;
    returnPath: string;
}

const OAUTH_STATE_COOKIE_NAME = 'dag_oauth_nonce';
const OAUTH_STATE_TTL_MINS = 10;

@ApiController('/api/session')
export class SessionController {
    constructor(
        private db: Db,
        private gitlab: GitLabService,
        private iacAuth: IacAuthService,
        private config: AppConfig
    ) {}

    /** Resolving `user` requires a valid JWT, so this 401s when unauthenticated. */
    @http.GET('me')
    async getIdentity(user: UserEntity): Promise<ISessionResponse> {
        return {
            id: user.id,
            name: user.name,
            username: user.username,
            avatarUrl: user.avatarUrl
        };
    }

    /** Lets the UI show a useful message instead of a broken login button. */
    @http.GET('status')
    async getStatus(): Promise<ISessionStatusResponse> {
        return { isConfigured: !!this.config.GITLAB_OAUTH_CLIENT_ID && !!this.config.GITLAB_OAUTH_CLIENT_SECRET };
    }

    @http.GET('login-url')
    async getLoginUrl(query: HttpQueries<{ redirectUri: string; returnPath?: string }>, response: HttpResponse): Promise<{ url: string }> {
        const redirectUri = this.validateRedirectUri(query.redirectUri);
        const returnPath = this.normalizeReturnPath(query.returnPath);

        // The state is a signed, short-lived JWT, and its nonce is echoed in an HttpOnly
        // cookie. An attacker who can craft a callback URL still cannot produce the cookie,
        // so a forged callback cannot complete a login.
        const nonce = randomBytes(32).toString('base64url');
        const state = await JWT.generate<IOAuthStatePayload>({
            subject: 'gitlab',
            expiryMins: OAUTH_STATE_TTL_MINS,
            payload: { nonce, redirectUri, returnPath }
        });

        this.setOAuthStateCookie(response, nonce, redirectUri);
        return { url: this.gitlab.getLoginUrl(redirectUri, state) };
    }

    @http.POST('login')
    async login(body: HttpBody<ISessionLoginRequest>, request: HttpRequest, response: HttpResponse): Promise<ISessionLoginResponse> {
        const state = await this.verifyOAuthState(body.state, request);
        this.clearOAuthStateCookie(response);

        const tokens = await this.gitlab.exchangeCode(state.redirectUri, body.code);
        const identity = await this.gitlab.getIdentity(tokens.accessToken);
        // buildSession encrypts the access/refresh tokens before they are persisted.
        const gitlabSession = this.gitlab.buildSession(tokens, state.redirectUri);

        const user = await this.db.transaction(async session => {
            // Serialize first-login creation for one GitLab user; the unique key on
            // gitlabUserId is the real guard, the lock just keeps find-then-insert atomic.
            await session.acquireSessionLock(['dag', 'login', identity.id]);

            const existing = await session.query(UserEntity).filter({ gitlabUserId: identity.id }).findOneOrUndefined();

            if (!existing) {
                return createPersistedEntity(
                    UserEntity,
                    {
                        id: uuid(),
                        gitlabUserId: identity.id,
                        username: identity.username,
                        name: identity.name,
                        avatarUrl: identity.avatarUrl,
                        gitlabSession,
                        createdAt: new Date(),
                        lastLoginAt: new Date()
                    },
                    session
                );
            }

            existing.username = identity.username;
            existing.name = identity.name;
            existing.avatarUrl = identity.avatarUrl;
            existing.gitlabSession = gitlabSession;
            existing.lastLoginAt = new Date();
            await persistEntity(existing, session);
            return existing;
        });

        // Grants were cached against the old GitLab token; re-login should re-resolve them.
        this.iacAuth.invalidateUser(user.id);

        const jwt = await JWT.generate({ subject: user.id });
        return { jwt, returnPath: state.returnPath };
    }

    private async verifyOAuthState(stateToken: string, request: HttpRequest): Promise<IOAuthStatePayload> {
        const parsed = await JWT.verify<IOAuthStatePayload>(stateToken);
        if (!parsed.isValid) throw new HttpUnauthorizedError();

        const { nonce, redirectUri, returnPath } = parsed.payload;
        if (!nonce || !redirectUri || !returnPath) throw new HttpUnauthorizedError();
        if (this.getCookie(request, OAUTH_STATE_COOKIE_NAME) !== nonce) throw new HttpUnauthorizedError();

        return {
            nonce,
            redirectUri: this.validateRedirectUri(redirectUri),
            returnPath: this.normalizeReturnPath(returnPath)
        };
    }

    /** The redirect target must be a /login page on an origin we control. */
    private validateRedirectUri(redirectUri: string): string {
        let url: URL;
        try {
            url = new URL(redirectUri);
        } catch {
            throw new HttpBadRequestError('Invalid redirectUri');
        }

        if (url.pathname !== '/login') {
            throw new HttpBadRequestError('redirectUri path must be /login');
        }

        if (!this.allowedRedirectOrigins.has(url.origin)) {
            throw new HttpBadRequestError('redirectUri origin is not allowed');
        }

        return url.toString();
    }

    private get allowedRedirectOrigins(): Set<string> {
        const origins = new Set<string>();

        for (const raw of (this.config.OAUTH_REDIRECT_ORIGINS ?? '').split(',')) {
            const origin = raw.trim();
            if (origin) origins.add(new URL(origin).origin);
        }

        if (this.config.PUBLIC_BASE_URL) {
            origins.add(new URL(this.config.PUBLIC_BASE_URL).origin);
        }

        if (!origins.size) {
            throw new HttpBadRequestError('No OAuth redirect origins are configured');
        }

        return origins;
    }

    /** Prevents the post-login redirect being used as an open redirect. */
    private normalizeReturnPath(returnPath: string | undefined): string {
        const path = returnPath || '/';
        if (!path.startsWith('/') || path.startsWith('//')) {
            throw new HttpBadRequestError('returnPath must be an absolute in-app path');
        }
        if (path.length > 1024) {
            throw new HttpBadRequestError('returnPath is too long');
        }

        const url = new URL(path, 'http://dag.local');
        const normalized = `${url.pathname}${url.search}${url.hash}`;

        // Re-check the *normalized* path: inputs like "/..//evil.com" pass the guard above but
        // collapse to "//evil.com", which is a protocol-relative (off-origin) URL.
        if (!normalized.startsWith('/') || normalized.startsWith('//')) {
            throw new HttpBadRequestError('returnPath must be an absolute in-app path');
        }
        return normalized;
    }

    private setOAuthStateCookie(response: HttpResponse, nonce: string, redirectUri: string) {
        const secure = new URL(redirectUri).protocol === 'https:' ? '; Secure' : '';
        response.setHeader(
            'Set-Cookie',
            `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(nonce)}; Max-Age=${OAUTH_STATE_TTL_MINS * 60}; Path=/api/session; HttpOnly; SameSite=Lax${secure}`
        );
    }

    private clearOAuthStateCookie(response: HttpResponse) {
        response.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE_NAME}=; Max-Age=0; Path=/api/session; HttpOnly; SameSite=Lax`);
    }

    private getCookie(request: HttpRequest, name: string): string | null {
        const cookieHeader = request.headers.cookie;
        if (!cookieHeader) return null;

        for (const part of cookieHeader.split(';')) {
            const [rawName, ...rawValue] = part.trim().split('=');
            if (rawName === name) return decodeURIComponent(rawValue.join('='));
        }
        return null;
    }
}
