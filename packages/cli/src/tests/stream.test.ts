import type { DeploymentStatusEvent, DeploymentTargetStatusEvent } from '@zyno-io/dag-shared';

import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';

import { streamDeploymentEvents, submitDeploy } from '../api.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function mockStream(t: TestContext) {
    let stream: ReadableStreamDefaultController<Uint8Array>;
    let aborted = false;
    const response = new Response(
        new ReadableStream<Uint8Array>({
            start: controller => {
                stream = controller;
            }
        }),
        {
            headers: { 'Content-Type': 'text/event-stream' }
        }
    );
    const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
        options.signal?.addEventListener('abort', () => {
            aborted = true;
            stream.error(new DOMException('Aborted', 'AbortError'));
        });
        return response;
    });
    return {
        send: async (event: string, data: unknown) => {
            stream.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            await flush();
        },
        break: () => stream.error(new Error('Socket closed')),
        isClosed: () => aborted,
        requestCount: () => fetchMock.mock.callCount()
    };
}

describe('deployment stream liveness', () => {
    it('waits beyond the old eight-hour deadline while only heartbeats arrive, then succeeds', async t => {
        t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
        const stream = mockStream(t);
        const statuses: DeploymentStatusEvent[] = [];
        let finished = false;
        const result = streamDeploymentEvents('https://dag.example.test', 'deployment', event => statuses.push(event));
        void result.then(() => {
            finished = true;
        });
        await flush();
        // Exceed --timeout 28800 plus its former 30-second grace period.
        for (let i = 0; i < 1923; i++) {
            t.mock.timers.tick(15000);
            await stream.send('heartbeat', {});
        }
        assert.equal(finished, false);
        assert.equal(stream.isClosed(), false);
        assert.deepEqual(statuses, []);
        await stream.send('status', { status: 'deployed', message: 'All targets succeeded' });
        const final = await result;
        assert.equal(final.status, 'deployed');
        assert.equal(stream.isClosed(), true);
        // No leftover watchdog can reject or keep the connection alive.
        t.mock.timers.tick(30000);
    });

    it('forwards target outcomes and waits for the server terminal failure', async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const stream = mockStream(t);
        const targets: DeploymentTargetStatusEvent[] = [];
        const result = streamDeploymentEvents(
            'https://dag.example.test',
            'deployment',
            () => {},
            event => targets.push(event)
        );
        await flush();
        t.mock.timers.tick(25000);
        await stream.send('target', {
            target: { id: 'short', clusterId: 1, clusterName: 'edge', monitorTimeoutSecs: 10, status: 'failed', message: 'Target timed out' }
        });
        t.mock.timers.tick(25000);
        await stream.send('status', { status: 'monitoring', message: 'Waiting for other target' });
        t.mock.timers.tick(25000);
        await stream.send('status', { status: 'failed', message: '1 of 2 cluster targets failed' });
        const final = await result;
        assert.equal(final.message, '1 of 2 cluster targets failed');
        assert.equal(targets[0].target.status, 'failed');
        assert.equal(stream.isClosed(), true);
    });

    it('bounds a silent initial event-stream connection', async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let aborted = false;
        t.mock.method(
            globalThis,
            'fetch',
            (_url: string, options: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        aborted = true;
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                })
        );
        const result = streamDeploymentEvents('https://dag.example.test', 'deployment', () => {});
        const failure = assert.rejects(result, /SSE connection lost.*Deployment outcome is unknown/);
        t.mock.timers.tick(30000);
        await failure;
        assert.equal(aborted, true);
    });

    it('fails a once-healthy stream after heartbeats stop without returning rollout failure', async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const stream = mockStream(t);
        const statuses: DeploymentStatusEvent[] = [];
        const result = streamDeploymentEvents('https://dag.example.test', 'deployment', event => statuses.push(event));
        const failure = assert.rejects(result, /SSE connection lost.*Deployment outcome is unknown/);
        await stream.send('heartbeat', {});
        t.mock.timers.tick(29999);
        assert.equal(stream.isClosed(), false);
        t.mock.timers.tick(1);
        await failure;
        assert.equal(stream.isClosed(), true);
        assert.deepEqual(statuses, []);
    });

    it('reports a broken stream as a connection error', async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const stream = mockStream(t);
        const result = streamDeploymentEvents('https://dag.example.test', 'deployment', () => {});
        const failure = assert.rejects(result, /SSE connection error.*Deployment outcome is unknown/);
        await flush();
        stream.break();
        await failure;
        const calls = stream.requestCount();
        t.mock.timers.tick(60000);
        await flush();
        assert.equal(stream.requestCount(), calls);
    });
});

const deployOptions = {
    serverUrl: 'https://dag.example.test',
    repoUrl: 'https://gitlab.example.test/org/app',
    jobId: '42',
    jobToken: 'token',
    version: '1',
    chartBuffer: Buffer.from('chart'),
    timeout: 28800
};

describe('deployment submission watchdog', () => {
    for (const stalledBody of [false, true]) {
        it(`bounds submission with ${stalledBody ? 'stalled response body' : 'no response headers'}`, async t => {
            t.mock.timers.enable({ apis: ['setTimeout'] });
            let aborted = false;
            t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
                const stalled = new Promise<Response>((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        aborted = true;
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                });
                return stalledBody ? ({ ok: true, json: () => stalled } as unknown as Response) : stalled;
            });
            const result = submitDeploy(deployOptions);
            const failure = assert.rejects(result, /server did not respond.*30s.*Deployment outcome is unknown/);
            await flush();
            t.mock.timers.tick(30000);
            await failure;
            assert.equal(aborted, true);
        });
    }
});
