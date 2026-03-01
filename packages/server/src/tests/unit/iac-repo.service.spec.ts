import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import simpleGit from 'simple-git';

import { IacRepoService } from '../../services/iac-repo.service';
import { ChartService } from '../../services/chart.service';
import { IacEntity } from '../../entities/iac.entity';
import { AppConfig } from '../../config';

describe('IacRepoService', () => {
    let service: IacRepoService;
    let tempDir: string;
    let bareRepoPath: string;
    let mockIac: IacEntity;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-test-'));

        // Create a bare repo to simulate remote
        bareRepoPath = path.join(tempDir, 'remote.git');
        await simpleGit().raw(['init', '--bare', bareRepoPath]);

        // Create an initial commit in a temp clone so the bare repo has a branch
        const initClonePath = path.join(tempDir, 'init-clone');
        await simpleGit().clone(bareRepoPath, initClonePath);
        const initGit = simpleGit(initClonePath);
        fs.writeFileSync(path.join(initClonePath, 'README.md'), '# IAC Repo');
        await initGit.add('.');
        await initGit.commit('Initial commit');
        await initGit.push('origin', 'main');

        const config = new AppConfig();
        config.DATA_DIR = path.join(tempDir, 'data');
        config.MUTEX_MODE = 'local';

        const chartService = new ChartService();
        const logger = { log: () => {}, warn: () => {}, error: () => {} } as any;

        service = new IacRepoService(config, chartService, logger);

        mockIac = {
            id: 1,
            name: 'test-iac',
            repoUrl: bareRepoPath,
            accessToken: ''
        } as IacEntity;
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should clone repo on first call', async () => {
        const localPath = await service.ensureRepo(mockIac);
        assert.ok(fs.existsSync(path.join(localPath, '.git')));
        assert.ok(fs.existsSync(path.join(localPath, 'README.md')));
    });

    it('should fetch and reset on subsequent calls', async () => {
        const localPath = await service.ensureRepo(mockIac);
        fs.writeFileSync(path.join(localPath, 'local-only.txt'), 'should be removed');

        const localPath2 = await service.ensureRepo(mockIac);
        assert.equal(localPath2, localPath);
        assert.ok(!fs.existsSync(path.join(localPath2, 'local-only.txt')));
    });

    it('should commit and push changes', async () => {
        const localPath = await service.ensureRepo(mockIac);

        fs.mkdirSync(path.join(localPath, 'charts', 'my-app'), { recursive: true });
        fs.writeFileSync(path.join(localPath, 'charts', 'my-app', 'Chart.yaml'), 'apiVersion: v2');

        const sha = await service.commitAndPush(localPath, mockIac, 'test: add chart');
        assert.ok(sha);
        assert.ok(sha.length > 6);

        const verifyClone = path.join(tempDir, 'verify');
        await simpleGit().clone(bareRepoPath, verifyClone);
        assert.ok(fs.existsSync(path.join(verifyClone, 'charts', 'my-app', 'Chart.yaml')));
    });
});
