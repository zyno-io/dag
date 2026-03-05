import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as tar from 'tar';

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

    it('should exclude extraneous files by default', async () => {
        const chartDir = path.join(tempDir, 'my-chart');
        fs.mkdirSync(chartDir, { recursive: true });
        fs.writeFileSync(path.join(chartDir, 'Chart.yaml'), 'apiVersion: v2\nname: my-chart');
        fs.writeFileSync(path.join(chartDir, 'values.yaml'), 'replicaCount: 1');
        fs.writeFileSync(path.join(chartDir, 'README.md'), '# My Chart');
        fs.writeFileSync(path.join(chartDir, 'LICENSE'), 'MIT');
        fs.mkdirSync(path.join(chartDir, 'templates'), { recursive: true });
        fs.writeFileSync(path.join(chartDir, 'templates', 'deployment.yaml'), 'kind: Deployment');

        const buffer = await packageChart(chartDir);
        const entries = await listTarEntries(buffer);

        assert.ok(entries.includes('my-chart/Chart.yaml'));
        assert.ok(entries.includes('my-chart/values.yaml'));
        assert.ok(entries.includes('my-chart/templates/deployment.yaml'));
        assert.ok(!entries.includes('my-chart/README.md'), 'README.md should be excluded');
        assert.ok(!entries.includes('my-chart/LICENSE'), 'LICENSE should be excluded');
    });

    it('should include all files when includeAllFiles is true', async () => {
        const chartDir = path.join(tempDir, 'my-chart');
        fs.mkdirSync(chartDir, { recursive: true });
        fs.writeFileSync(path.join(chartDir, 'Chart.yaml'), 'apiVersion: v2\nname: my-chart');
        fs.writeFileSync(path.join(chartDir, 'values.yaml'), 'replicaCount: 1');
        fs.writeFileSync(path.join(chartDir, 'README.md'), '# My Chart');

        const buffer = await packageChart(chartDir, { includeAllFiles: true });
        const entries = await listTarEntries(buffer);

        assert.ok(entries.includes('my-chart/Chart.yaml'));
        assert.ok(entries.includes('my-chart/values.yaml'));
        assert.ok(entries.includes('my-chart/README.md'), 'README.md should be included');
    });
});

async function listTarEntries(buffer: Buffer): Promise<string[]> {
    const { Readable } = await import('node:stream');
    const entries: string[] = [];
    const parser = new tar.Parser({
        onReadEntry: entry => {
            entries.push(entry.path);
            entry.resume();
        }
    });
    const stream = Readable.from(buffer);
    await new Promise<void>((resolve, reject) => {
        stream.pipe(parser);
        parser.on('end', resolve);
        parser.on('error', reject);
    });
    return entries;
}
