import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { submitDeploy } from '../api.js';

describe('API client', () => {
    describe('submitDeploy', () => {
        it('should submit deployment and return deploymentId', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({ deploymentId: 'test-uuid-123' })
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                const deploymentId = await submitDeploy({
                    serverUrl: 'http://localhost:3000',
                    repoUrl: 'https://gitlab.example.com/org/app',
                    jobId: '12345',
                    jobToken: 'test-token',
                    version: '1.0.0',
                    chartBuffer: Buffer.from('fake-chart-data'),
                    timeout: 300
                });

                assert.equal(deploymentId, 'test-uuid-123');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should throw on non-200 response', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
                text: async () => 'Not found'
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                await assert.rejects(
                    submitDeploy({
                        serverUrl: 'http://localhost:3000',
                        repoUrl: 'https://gitlab.example.com/org/app',
                        jobId: '12345',
                        jobToken: 'test-token',
                        version: '1.0.0',
                        chartBuffer: Buffer.from('fake-chart-data'),
                        timeout: 300
                    }),
                    /Deploy request failed \(404\)/
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
