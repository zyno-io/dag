import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { packageChart } from '../chart.js';

describe('packageChart', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-pkg-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should package a chart directory into a tgz buffer', async () => {
        const chartDir = path.join(tempDir, 'my-chart');
        fs.mkdirSync(chartDir, { recursive: true });
        fs.writeFileSync(path.join(chartDir, 'Chart.yaml'), 'apiVersion: v2\nname: my-chart');
        fs.writeFileSync(path.join(chartDir, 'values.yaml'), 'replicaCount: 1');

        const buffer = await packageChart(chartDir);

        assert.ok(buffer instanceof Buffer);
        assert.ok(buffer.length > 0);

        // Verify it's a valid gzip (starts with 0x1f 0x8b)
        assert.equal(buffer[0], 0x1f);
        assert.equal(buffer[1], 0x8b);
    });

    it('should throw for missing chart path', async () => {
        await assert.rejects(packageChart('/nonexistent/path'), /does not exist/);
    });

    it('should throw for empty directory', async () => {
        const emptyDir = path.join(tempDir, 'empty');
        fs.mkdirSync(emptyDir);

        await assert.rejects(packageChart(emptyDir), /empty/);
    });

    it('should read existing .tgz file directly', async () => {
        const tgzPath = path.join(tempDir, 'chart.tgz');
        const fakeContent = Buffer.from([0x1f, 0x8b, 0x08, 0x00]); // gzip magic bytes
        fs.writeFileSync(tgzPath, fakeContent);

        const buffer = await packageChart(tgzPath);
        assert.deepEqual(buffer, fakeContent);
    });
});
