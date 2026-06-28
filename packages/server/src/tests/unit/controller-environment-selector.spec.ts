import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DeployController } from '../../controllers/deploy.controller';
import { GetController } from '../../controllers/get.controller';

describe('controller environment selector forwarding', () => {
    it('should pass environment selector for deploy requests', async () => {
        const sentinel = new Error('stop');
        let receivedEnvironment: string | undefined;
        const controller = new DeployController(
            {
                authenticateAndResolve: async (_repoUrl: string, _jobId: string, _jobToken: string, environment?: string) => {
                    receivedEnvironment = environment;
                    throw sentinel;
                }
            } as any,
            { trackDeployment: () => {} } as any,
            { processDeployment: async () => {} } as any,
            { log: () => {}, error: () => {} } as any
        );

        await assert.rejects(
            () =>
                controller.deploy({
                    repoUrl: 'https://gitlab.example.com/org/app',
                    jobId: '12345',
                    jobToken: 'test-token',
                    environment: 'production',
                    version: '1.0.0',
                    chart: { path: 'unused' }
                } as any),
            err => err === sentinel
        );

        assert.equal(receivedEnvironment, 'production');
    });

    it('should pass environment selector for chart requests', async () => {
        const sentinel = new Error('stop');
        let receivedEnvironment: string | undefined;
        const controller = new GetController(
            {
                authenticateAndResolve: async (_repoUrl: string, _jobId: string, _jobToken: string, environment?: string) => {
                    receivedEnvironment = environment;
                    throw sentinel;
                }
            } as any,
            {} as any,
            {} as any
        );

        await assert.rejects(
            () =>
                controller.getChart(
                    {
                        repoUrl: 'https://gitlab.example.com/org/app',
                        jobId: '12345',
                        jobToken: 'test-token',
                        environment: 'production'
                    } as any,
                    {} as any
                ),
            err => err === sentinel
        );

        assert.equal(receivedEnvironment, 'production');
    });

    it('should pass environment selector for values requests', async () => {
        const sentinel = new Error('stop');
        let receivedEnvironment: string | undefined;
        const controller = new GetController(
            {
                authenticateAndResolve: async (_repoUrl: string, _jobId: string, _jobToken: string, environment?: string) => {
                    receivedEnvironment = environment;
                    throw sentinel;
                }
            } as any,
            {} as any,
            {} as any
        );

        await assert.rejects(
            () =>
                controller.getValues(
                    {
                        repoUrl: 'https://gitlab.example.com/org/app',
                        jobId: '12345',
                        jobToken: 'test-token',
                        environment: 'production'
                    } as any,
                    {} as any
                ),
            err => err === sentinel
        );

        assert.equal(receivedEnvironment, 'production');
    });
});
