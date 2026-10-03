import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppAccessService, EnvironmentInput } from '../../services/app-access.service';

const service = new AppAccessService({} as any, {} as any);
const input: EnvironmentInput = {
    name: 'staging',
    branch: 'main',
    iacId: 1,
    iacPath: 'charts/service',
    iacBranch: null,
    targets: [{ clusterId: 1, helmType: 'flux', helmNamespace: null, helmName: null }]
};

describe('target rollout timeout configuration', () => {
    it('keeps omitted/null budgets on the default and preserves independent overrides', () => {
        const normalized = service.normalizeEnvironmentInput({
            ...input,
            targets: [
                input.targets![0],
                { ...input.targets![0], clusterId: 2, monitorTimeoutSecs: 28800 },
                { ...input.targets![0], clusterId: 3, monitorTimeoutSecs: null }
            ]
        });
        assert.deepEqual(
            normalized.targets.map(target => target.monitorTimeoutSecs),
            [null, 28800, null]
        );
        assert.equal(normalized.targets[0].helmName, 'service');
    });

    it('keeps legacy single-target API input compatible', () => {
        const normalized = service.normalizeEnvironmentInput({ ...input, targets: undefined, clusterId: 1, helmType: 'flux' });
        assert.equal(normalized.targets[0].monitorTimeoutSecs, null);
    });

    it('rejects zero, negative, fractional, non-finite and out-of-range budgets', () => {
        for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
            assert.throws(
                () => service.normalizeEnvironmentInput({ ...input, targets: [{ ...input.targets![0], monitorTimeoutSecs: value }] }),
                /monitorTimeoutSecs must be a whole number/
            );
        }
    });
});
