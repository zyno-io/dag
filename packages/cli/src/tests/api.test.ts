import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { submitDeploy, getChart, getValues } from '../api.js';

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

    describe('getChart', () => {
        it('should fetch chart and return Buffer', async () => {
            const chartData = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]); // gzip magic bytes
            const mockResponse = {
                ok: true,
                status: 200,
                arrayBuffer: async () => chartData.buffer
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                const result = await getChart({
                    serverUrl: 'http://localhost:3000',
                    repoUrl: 'https://gitlab.example.com/org/app',
                    jobId: '12345',
                    jobToken: 'test-token'
                });

                assert.ok(Buffer.isBuffer(result));
                assert.equal(result[0], 0x1f);
                assert.equal(result[1], 0x8b);

                // Verify correct URL was called
                const fetchCall = (globalThis.fetch as any).mock.calls[0];
                assert.equal(fetchCall.arguments[0], 'http://localhost:3000/api/get/chart');

                // Verify body
                const body = JSON.parse(fetchCall.arguments[1].body);
                assert.equal(body.repoUrl, 'https://gitlab.example.com/org/app');
                assert.equal(body.jobId, '12345');
                assert.equal(body.jobToken, 'test-token');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should throw on non-200 response', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
                text: async () => 'Chart not found'
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                await assert.rejects(
                    getChart({
                        serverUrl: 'http://localhost:3000',
                        repoUrl: 'https://gitlab.example.com/org/app',
                        jobId: '12345',
                        jobToken: 'test-token'
                    }),
                    /Get chart request failed \(404\)/
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should strip trailing slashes from server URL', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                arrayBuffer: async () => new ArrayBuffer(0)
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                await getChart({
                    serverUrl: 'http://localhost:3000///',
                    repoUrl: 'https://gitlab.example.com/org/app',
                    jobId: '12345',
                    jobToken: 'test-token'
                });

                const fetchCall = (globalThis.fetch as any).mock.calls[0];
                assert.equal(fetchCall.arguments[0], 'http://localhost:3000/api/get/chart');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    describe('getValues', () => {
        it('should fetch values and return parsed JSON', async () => {
            const valuesData = { replicaCount: 3, image: { tag: 'latest' } };
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => valuesData
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                const result = await getValues({
                    serverUrl: 'http://localhost:3000',
                    repoUrl: 'https://gitlab.example.com/org/app',
                    jobId: '12345',
                    jobToken: 'test-token'
                });

                assert.deepEqual(result, valuesData);

                // Verify correct URL was called
                const fetchCall = (globalThis.fetch as any).mock.calls[0];
                assert.equal(fetchCall.arguments[0], 'http://localhost:3000/api/get/values');

                // Verify Content-Type header
                assert.equal(fetchCall.arguments[1].headers['Content-Type'], 'application/json');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('should throw on non-200 response', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                text: async () => 'Unauthorized'
            };

            const originalFetch = globalThis.fetch;
            globalThis.fetch = mock.fn(() => Promise.resolve(mockResponse as Response));

            try {
                await assert.rejects(
                    getValues({
                        serverUrl: 'http://localhost:3000',
                        repoUrl: 'https://gitlab.example.com/org/app',
                        jobId: '12345',
                        jobToken: 'test-token'
                    }),
                    /Get values request failed \(401\)/
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
