import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GitProviderService } from '../../services/git-provider.service';
import { JobTokenVerificationError } from '../../errors';

describe('GitProviderService', () => {
    let service: GitProviderService;

    beforeEach(() => {
        service = new GitProviderService();
    });

    describe('GitLab provider', () => {
        it('should verify job token and return branch', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({
                    id: 12345,
                    ref: 'main',
                    web_url: 'https://gitlab.example.com/org/app/-/jobs/12345',
                    pipeline: { project_id: 1, sha: 'abc123def456' },
                    project: { path_with_namespace: 'org/app' }
                })
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response)) as any;

            try {
                const result = await service.verifyJobAndGetBranch('gitlab', 'https://gitlab.example.com/org/app', '12345', 'test-job-token');
                assert.equal(result.branch, 'main');
                assert.equal(result.commitSha, 'abc123def456');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should throw on invalid token', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response)) as any;

            try {
                await assert.rejects(
                    () => service.verifyJobAndGetBranch('gitlab', 'https://gitlab.example.com/org/app', '12345', 'bad-token'),
                    err => err instanceof JobTokenVerificationError
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should throw when job belongs to a different project', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({
                    id: 12345,
                    ref: 'main',
                    web_url: 'https://gitlab.example.com/other/repo/-/jobs/12345',
                    pipeline: { project_id: 99 },
                    project: { path_with_namespace: 'other/repo' }
                })
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response)) as any;

            try {
                await assert.rejects(
                    () => service.verifyJobAndGetBranch('gitlab', 'https://gitlab.example.com/org/app', '12345', 'test-token'),
                    err => err instanceof JobTokenVerificationError
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    it('should throw on unknown provider', async () => {
        await assert.rejects(() => service.verifyJobAndGetBranch('bitbucket' as any, 'https://example.com', '1', 'token'), {
            message: /Unknown git provider/
        });
    });

    it('should throw on unimplemented GitHub provider', async () => {
        await assert.rejects(() => service.verifyJobAndGetBranch('github', 'https://github.com/org/repo', '1', 'token'), {
            message: /not yet implemented/
        });
    });
});
