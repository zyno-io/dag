import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, it } from 'node:test';

describe('legacy CLI timeout compatibility', () => {
    for (const source of ['flag', 'environment']) {
        it(`accepts the deprecated ${source} timeout used by existing CI jobs`, () => {
            const result = spawnSync(
                process.execPath,
                [
                    path.resolve(__dirname, '../index.js'),
                    '/missing-dag-test-chart',
                    '--server',
                    'https://dag.example.test',
                    '--repo',
                    'https://gitlab.example.test/org/app',
                    '--job-id',
                    '42',
                    '--job-token',
                    'token',
                    '--deploy-version',
                    '1',
                    ...(source === 'flag' ? ['--timeout', '28800'] : [])
                ],
                { encoding: 'utf8', env: { ...process.env, DAG_TIMEOUT: source === 'environment' ? '28800' : undefined } }
            );
            assert.equal(result.status, 1); // Expected chart failure happens after option handling.
            assert.match(result.stderr, /--timeout\/DAG_TIMEOUT is deprecated and ignored/);
            assert.match(result.stderr, /Chart path does not exist/);
        });
    }
});
