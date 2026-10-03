import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, type TestContext } from 'node:test';

import { AppConfig } from '../../config';
import { DeployController } from '../../controllers/deploy.controller';
import { DeploymentTargetEntity } from '../../entities/deployment-target.entity';
import { DeploymentEntity } from '../../entities/deployment.entity';
import { getDeploymentChannel } from '../../services/deployment.service';

function setup(t: TestContext, id: string, duringSnapshot?: () => void, duringDeploymentRead?: () => void) {
    const deployment = { id, status: 'monitoring', statusMessage: 'Watching rollout', commitSha: null };
    t.mock.method(
        DeploymentEntity,
        'query',
        () =>
            ({
                filterField: () => ({
                    findOneOrUndefined: async () => {
                        duringDeploymentRead?.();
                        return deployment;
                    }
                })
            }) as any
    );
    t.mock.method(
        DeploymentTargetEntity,
        'query',
        () =>
            ({
                filterField: () => ({
                    find: async () => {
                        duringSnapshot?.();
                        return [];
                    }
                })
            }) as any
    );
    const request = new EventEmitter();
    const frames: string[] = [];
    let ended = false;
    const response = Object.assign(new EventEmitter(), {
        setHeader: () => {},
        write: (frame: string) => frames.push(frame),
        end: () => {
            ended = true;
        }
    });
    const controller = new DeployController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, new AppConfig());
    return { controller, request, response, frames, ended: () => ended };
}

describe('deployment SSE heartbeats', () => {
    it('captures a terminal result while the initial deployment query is in flight', async t => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        const state = setup(t, 'initial-query-race', undefined, () => {
            getDeploymentChannel('initial-query-race').publish({ status: 'deployed', message: 'Done during query' });
        });
        await state.controller.events('initial-query-race', state.request as any, state.response as any);
        assert.equal(state.ended(), true);
        assert.ok(state.frames.some(frame => frame.includes('Done during query')));
    });

    it('sends periodic pings during a quiet rollout and cleans up on terminal result', async t => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        const state = setup(t, 'quiet-rollout');
        await state.controller.events('quiet-rollout', state.request as any, state.response as any);
        for (let i = 0; i < 3; i++) t.mock.timers.tick(15000);
        assert.equal(state.frames.filter(frame => frame.startsWith('event: heartbeat')).length, 3);
        getDeploymentChannel('quiet-rollout').publish({ status: 'deployed', message: 'Done' });
        assert.equal(state.ended(), true);
        const frameCount = state.frames.length;
        t.mock.timers.tick(60000);
        assert.equal(state.frames.length, frameCount);
        assert.equal(state.response.listenerCount('close'), 0);
    });

    it('cleans up pings and subscriptions after a client disconnect', async t => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        const state = setup(t, 'disconnected');
        await state.controller.events('disconnected', state.request as any, state.response as any);
        state.response.emit('close');
        const frameCount = state.frames.length;
        t.mock.timers.tick(60000);
        getDeploymentChannel('disconnected').publish({ status: 'monitoring', message: 'Still running' });
        assert.equal(state.frames.length, frameCount);
    });

    it('keeps the stream alive after the incoming request closes', async t => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        const state = setup(t, 'request-closed');
        await state.controller.events('request-closed', state.request as any, state.response as any);
        state.request.emit('close');
        t.mock.timers.tick(15000);
        assert.ok(state.frames.some(frame => frame.startsWith('event: heartbeat')));
        getDeploymentChannel('request-closed').publish({ status: 'deployed', message: 'Done' });
        assert.equal(state.ended(), true);
    });

    it('delivers a terminal result that arrives while the initial snapshot is being read', async t => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        const state = setup(t, 'snapshot-race', () => {
            getDeploymentChannel('snapshot-race').publish({ status: 'failed', message: 'Target budget expired' });
        });
        await state.controller.events('snapshot-race', state.request as any, state.response as any);
        assert.equal(state.ended(), true);
        assert.ok(state.frames.some(frame => frame.includes('Target budget expired')));
        const frameCount = state.frames.length;
        t.mock.timers.tick(60000);
        assert.equal(state.frames.length, frameCount);
    });
});
