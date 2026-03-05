import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestingHelpers } from '@zyno-io/dk-server-foundation';

import { createTestingFacade } from '../helpers/testing-facade';

const tf = createTestingFacade();
TestingHelpers.installStandardHooks(tf);

describe('GetController', () => {
    it('POST /api/get/chart should return 400 for missing fields', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/get/chart', {
            repoUrl: 'https://gitlab.example.com/org/app'
            // missing jobId and jobToken
        });

        assert.equal(response.statusCode, 400);
    });

    it('POST /api/get/values should return 400 for missing fields', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/get/values', {
            jobId: '123'
            // missing repoUrl and jobToken
        });

        assert.equal(response.statusCode, 400);
    });

    it('POST /api/get/chart should return 404 for unknown repo', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/get/chart', {
            repoUrl: 'https://gitlab.example.com/org/nonexistent',
            jobId: '12345',
            jobToken: 'test-token'
        });

        assert.equal(response.statusCode, 404);
    });

    it('POST /api/get/values should return 404 for unknown repo', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/get/values', {
            repoUrl: 'https://gitlab.example.com/org/nonexistent',
            jobId: '12345',
            jobToken: 'test-token'
        });

        assert.equal(response.statusCode, 404);
    });
});
