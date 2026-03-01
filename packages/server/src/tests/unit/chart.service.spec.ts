import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import * as tar from 'tar';

import { ChartService } from '../../services/chart.service';

describe('ChartService', () => {
    let service: ChartService;
    let tempDir: string;

    beforeEach(() => {
        service = new ChartService();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    async function createTestTgz(files: Record<string, string>, rootDir = 'my-chart'): Promise<Buffer> {
        const srcDir = path.join(tempDir, 'src', rootDir);
        fs.mkdirSync(srcDir, { recursive: true });

        for (const [name, content] of Object.entries(files)) {
            const filePath = path.join(srcDir, name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        }

        const tgzPath = path.join(tempDir, 'chart.tgz');
        await tar.create({ gzip: true, file: tgzPath, cwd: path.join(tempDir, 'src') }, [rootDir]);

        return fs.readFileSync(tgzPath);
    }

    it('should extract tgz to destination path', async () => {
        const tgz = await createTestTgz({
            'Chart.yaml': 'apiVersion: v2\nname: my-chart',
            'values.yaml': 'replicaCount: 1',
            'templates/deployment.yaml': 'kind: Deployment'
        });

        const destPath = path.join(tempDir, 'output');
        await service.extractTgz(tgz, destPath);

        assert.ok(fs.existsSync(path.join(destPath, 'Chart.yaml')));
        assert.ok(fs.existsSync(path.join(destPath, 'values.yaml')));
        assert.ok(fs.existsSync(path.join(destPath, 'templates', 'deployment.yaml')));
        assert.equal(fs.readFileSync(path.join(destPath, 'values.yaml'), 'utf-8'), 'replicaCount: 1');
    });

    it('should handle nested chart directory structure', async () => {
        const tgz = await createTestTgz({
            'Chart.yaml': 'apiVersion: v2',
            'charts/subchart/Chart.yaml': 'apiVersion: v2\nname: subchart'
        });

        const destPath = path.join(tempDir, 'output');
        await service.extractTgz(tgz, destPath);

        assert.ok(fs.existsSync(path.join(destPath, 'Chart.yaml')));
        assert.ok(fs.existsSync(path.join(destPath, 'charts', 'subchart', 'Chart.yaml')));
    });

    /**
     * Build a raw tar+gzip buffer with a single entry whose path contains "../".
     * This bypasses the tar library's safety checks that would prevent creating
     * such an entry via the normal API.
     */
    function createMaliciousTgz(entryPath: string, content: string): Buffer {
        const contentBuf = Buffer.from(content);

        const header = Buffer.alloc(512);
        header.write(entryPath, 0, 100, 'utf-8');
        header.write('0000644\0', 100, 8, 'utf-8'); // mode
        header.write('0000000\0', 108, 8, 'utf-8'); // uid
        header.write('0000000\0', 116, 8, 'utf-8'); // gid
        header.write(contentBuf.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf-8'); // size
        header.write('00000000000\0', 136, 12, 'utf-8'); // mtime
        header.write('0', 156, 1, 'utf-8'); // type: regular file
        header.write('ustar\0', 257, 6, 'utf-8'); // magic
        header.write('00', 263, 2, 'utf-8'); // version

        // Calculate checksum (fill field with spaces first)
        header.write('        ', 148, 8, 'utf-8');
        let checksum = 0;
        for (let i = 0; i < 512; i++) checksum += header[i];
        header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');

        const contentBlock = Buffer.alloc(512);
        contentBuf.copy(contentBlock);

        const endBlock = Buffer.alloc(1024);
        return zlib.gzipSync(Buffer.concat([header, contentBlock, endBlock]));
    }

    it('should reject path traversal entries (ZipSlip)', async () => {
        const tgz = createMaliciousTgz('../../etc/malicious.txt', 'pwned');

        const destPath = path.join(tempDir, 'nested', 'output');
        await service.extractTgz(tgz, destPath);

        // The malicious entry should have been filtered out
        assert.ok(!fs.existsSync(path.join(tempDir, 'etc', 'malicious.txt')));
        assert.ok(!fs.existsSync(path.resolve(destPath, '../../etc/malicious.txt')));
    });

    it('should reject absolute path entries', async () => {
        const tgz = createMaliciousTgz('/tmp/malicious.txt', 'pwned');

        const destPath = path.join(tempDir, 'output');
        await service.extractTgz(tgz, destPath);

        assert.ok(!fs.existsSync('/tmp/malicious.txt'));
    });

    it('should overwrite existing contents', async () => {
        const destPath = path.join(tempDir, 'output');
        fs.mkdirSync(destPath, { recursive: true });
        fs.writeFileSync(path.join(destPath, 'old-file.txt'), 'should be removed');

        const tgz = await createTestTgz({ 'Chart.yaml': 'apiVersion: v2' });
        await service.extractTgz(tgz, destPath);

        assert.ok(!fs.existsSync(path.join(destPath, 'old-file.txt')));
        assert.ok(fs.existsSync(path.join(destPath, 'Chart.yaml')));
    });
});
