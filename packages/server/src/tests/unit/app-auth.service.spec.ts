import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HttpNotFoundError, HttpUnauthorizedError } from '@deepkit/http';

import { AppAuthService } from '../../services/app-auth.service';
import { GitProviderService } from '../../services/git-provider.service';
import { AppEntity } from '../../entities/app.entity';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';

describe('AppAuthService', () => {
    let service: AppAuthService;
    let gitProviderService: GitProviderService;
    const mockLogger = { warn: mock.fn(), log: mock.fn(), error: mock.fn() } as any;

    beforeEach(() => {
        gitProviderService = new GitProviderService();
        service = new AppAuthService(gitProviderService, mockLogger);
    });

    it('should throw HttpNotFoundError when no app matches repoUrl', async () => {
        // Mock AppEntity.query to return no results
        const originalQuery = AppEntity.query;
        AppEntity.query = (() => ({
            filterField: () => ({
                findOneOrUndefined: async () => undefined
            })
        })) as any;

        try {
            await assert.rejects(
                () => service.authenticateAndResolve('https://gitlab.example.com/org/nonexistent', '123', 'token'),
                (err: any) => err instanceof HttpNotFoundError && err.message.includes('No app configured')
            );
        } finally {
            AppEntity.query = originalQuery;
        }
    });

    it('should throw HttpUnauthorizedError on invalid job token', async () => {
        const originalQuery = AppEntity.query;
        AppEntity.query = (() => ({
            filterField: () => ({
                findOneOrUndefined: async () => ({ id: 1, gitProvider: 'gitlab', repoUrl: 'https://gitlab.example.com/org/app' })
            })
        })) as any;

        // Mock fetch to return 401 for GitLab job verification
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(() => Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized' } as Response)) as any;

        try {
            await assert.rejects(
                () => service.authenticateAndResolve('https://gitlab.example.com/org/app', '123', 'bad-token'),
                (err: any) => err instanceof HttpUnauthorizedError
            );
        } finally {
            AppEntity.query = originalQuery;
            globalThis.fetch = originalFetch;
        }
    });

    it('should throw HttpNotFoundError when no environment matches branch', async () => {
        const originalAppQuery = AppEntity.query;
        AppEntity.query = (() => ({
            filterField: () => ({
                findOneOrUndefined: async () => ({ id: 1, gitProvider: 'gitlab', repoUrl: 'https://gitlab.example.com/org/app' })
            })
        })) as any;

        const originalEnvQuery = AppEnvironmentEntity.query;
        AppEnvironmentEntity.query = (() => ({
            filterField: () => ({
                filterField: () => ({
                    findOneOrUndefined: async () => undefined
                })
            })
        })) as any;

        // Mock fetch for successful job verification
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 123,
                    ref: 'feature-branch',
                    web_url: 'https://gitlab.example.com/org/app/-/jobs/123',
                    pipeline: { project_id: 1, sha: 'abc123' },
                    project: { path_with_namespace: 'org/app' }
                })
            } as Response)
        ) as any;

        try {
            await assert.rejects(
                () => service.authenticateAndResolve('https://gitlab.example.com/org/app', '123', 'valid-token'),
                (err: any) => err instanceof HttpNotFoundError && err.message.includes('No environment configuration')
            );
        } finally {
            AppEntity.query = originalAppQuery;
            AppEnvironmentEntity.query = originalEnvQuery;
            globalThis.fetch = originalFetch;
        }
    });

    it('should return auth result on success', async () => {
        const mockApp = { id: 1, gitProvider: 'gitlab', repoUrl: 'https://gitlab.example.com/org/app' };
        const mockEnv = { id: 10, appId: 1, branch: 'main', iacId: 5, iacPath: 'charts/app' };

        const originalAppQuery = AppEntity.query;
        AppEntity.query = (() => ({
            filterField: () => ({
                findOneOrUndefined: async () => mockApp
            })
        })) as any;

        const originalEnvQuery = AppEnvironmentEntity.query;
        AppEnvironmentEntity.query = (() => ({
            filterField: () => ({
                filterField: () => ({
                    findOneOrUndefined: async () => mockEnv
                })
            })
        })) as any;

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    id: 123,
                    ref: 'main',
                    web_url: 'https://gitlab.example.com/org/app/-/jobs/123',
                    pipeline: { project_id: 1, sha: 'abc123def456' },
                    project: { path_with_namespace: 'org/app' }
                })
            } as Response)
        ) as any;

        try {
            const result = await service.authenticateAndResolve('https://gitlab.example.com/org/app', '123', 'valid-token');
            assert.equal(result.app, mockApp);
            assert.equal(result.appEnvironment, mockEnv);
            assert.equal(result.branch, 'main');
            assert.equal(result.commitSha, 'abc123def456');
        } finally {
            AppEntity.query = originalAppQuery;
            AppEnvironmentEntity.query = originalEnvQuery;
            globalThis.fetch = originalFetch;
        }
    });

    it('should normalize repo URL by removing trailing slashes', async () => {
        const originalAppQuery = AppEntity.query;
        let queriedUrl: string | undefined;
        AppEntity.query = (() => ({
            filterField: (_field: string, value: string) => {
                queriedUrl = value;
                return { findOneOrUndefined: async () => undefined };
            }
        })) as any;

        try {
            await service.authenticateAndResolve('https://gitlab.example.com/org/app///', '123', 'token').catch(() => {});
            assert.equal(queriedUrl, 'https://gitlab.example.com/org/app');
        } finally {
            AppEntity.query = originalAppQuery;
        }
    });
});
