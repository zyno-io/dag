import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestingHelpers } from '@zyno-io/dk-server-foundation';

import { createTestingFacade } from '../helpers/testing-facade';

const tf = createTestingFacade();
TestingHelpers.installStandardHooks(tf);

describe('DeployController', () => {
    it('POST /api/deploy should return 400 for missing chart', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'POST', '/api/deploy', {
            repoUrl: 'https://gitlab.example.com/org/unknown-repo',
            jobId: '12345',
            jobToken: 'test-token',
            version: '1.0.0'
        });

        assert.equal(response.statusCode, 400);
    });

    it('GET /api/deployments/:id/events should return 404 for unknown deployment', async () => {
        const response = await TestingHelpers.makeMockRequest(tf, 'GET', '/api/deployments/00000000-0000-0000-0000-000000000000/events', {});

        assert.equal(response.statusCode, 404);
    });
});
