import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { detectCIEnvironment } from '../detect.js';

describe('detectCIEnvironment', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Clear CI env vars
        delete process.env.GITLAB_CI;
        delete process.env.CI_PROJECT_URL;
        delete process.env.CI_JOB_ID;
        delete process.env.CI_JOB_TOKEN;
        delete process.env.GITHUB_ACTIONS;
        delete process.env.GITHUB_SERVER_URL;
        delete process.env.GITHUB_REPOSITORY;
        delete process.env.GITHUB_RUN_ID;
        delete process.env.GITHUB_TOKEN;
        delete process.env.ACTIONS_RUNTIME_TOKEN;
    });

    afterEach(() => {
        Object.assign(process.env, originalEnv);
    });

    it('should detect GitLab CI environment', () => {
        process.env.GITLAB_CI = 'true';
        process.env.CI_PROJECT_URL = 'https://gitlab.example.com/org/my-app';
        process.env.CI_JOB_ID = '12345';
        process.env.CI_JOB_TOKEN = 'glcbt-abc123';

        const result = detectCIEnvironment();
        assert.equal(result.repoUrl, 'https://gitlab.example.com/org/my-app');
        assert.equal(result.jobId, '12345');
        assert.equal(result.jobToken, 'glcbt-abc123');
    });

    it('should detect GitHub Actions environment', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        process.env.GITHUB_REPOSITORY = 'org/my-app';
        process.env.GITHUB_RUN_ID = '67890';
        process.env.GITHUB_TOKEN = 'ghs_abc123';

        const result = detectCIEnvironment();
        assert.equal(result.repoUrl, 'https://github.com/org/my-app');
        assert.equal(result.jobId, '67890');
        assert.equal(result.jobToken, 'ghs_abc123');
    });

    it('should throw when no CI environment detected', () => {
        assert.throws(() => detectCIEnvironment(), /Could not detect CI environment/);
    });

    it('should throw when GitLab CI vars are missing', () => {
        process.env.GITLAB_CI = 'true';
        // Missing CI_PROJECT_URL, CI_JOB_ID, CI_JOB_TOKEN

        assert.throws(() => detectCIEnvironment(), /missing required env vars/);
    });

    it('should use ACTIONS_RUNTIME_TOKEN as fallback for GITHUB_TOKEN', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        process.env.GITHUB_REPOSITORY = 'org/my-app';
        process.env.GITHUB_RUN_ID = '67890';
        process.env.ACTIONS_RUNTIME_TOKEN = 'runtime-token-123';

        const result = detectCIEnvironment();
        assert.equal(result.jobToken, 'runtime-token-123');
    });
});
