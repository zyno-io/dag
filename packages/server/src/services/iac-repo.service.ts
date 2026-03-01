import { ScopedLogger } from '@deepkit/logger';
import { withMutex } from '@zyno-io/dk-server-foundation';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AppConfig } from '../config';
import { IacEntity } from '../entities/iac.entity';
import { decryptField } from '../helpers/crypto';
import { ChartService } from './chart.service';

export class IacRepoService {
    constructor(
        private config: AppConfig,
        private chartService: ChartService,
        private logger: ScopedLogger
    ) {}

    private getLocalPath(iac: IacEntity): string {
        return path.join(this.config.DATA_DIR, 'iac-repos', String(iac.id));
    }

    private isHttpUrl(url: string): boolean {
        return url.startsWith('http://') || url.startsWith('https://');
    }

    /**
     * Create a simple-git instance with auth credentials injected via environment
     * variables, avoiding persisting tokens in .git/config.
     */
    private async createAuthGit(baseDir: string, iac: IacEntity): Promise<SimpleGit> {
        if (!this.isHttpUrl(iac.repoUrl)) {
            // Local paths (used in tests) don't need authentication
            return simpleGit(baseDir);
        }

        const accessToken = await decryptField(iac, 'accessToken');
        const basicAuth = Buffer.from(`token:${accessToken}`).toString('base64');
        return simpleGit(baseDir).env({
            GIT_CONFIG_COUNT: '3',
            GIT_CONFIG_KEY_0: 'http.extraHeader',
            GIT_CONFIG_VALUE_0: `Authorization: Basic ${basicAuth}`,
            GIT_CONFIG_KEY_1: 'user.email',
            GIT_CONFIG_VALUE_1: 'dag@automated',
            GIT_CONFIG_KEY_2: 'user.name',
            GIT_CONFIG_VALUE_2: 'DAG',
            GIT_TERMINAL_PROMPT: '0'
        });
    }

    async ensureRepo(iac: IacEntity, branch?: string | null): Promise<string> {
        const localPath = this.getLocalPath(iac);

        const gitDir = path.join(localPath, '.git');
        const exists = await fs.stat(gitDir).then(
            () => true,
            () => false
        );

        if (exists) {
            // Repo already cloned — fetch and hard reset to origin/HEAD
            this.logger.log(`Fetching existing IAC repo: ${iac.name}`);
            const git = await this.createAuthGit(localPath, iac);
            await git.fetch('origin');
            const targetBranch = branch || (await this.getDefaultBranch(git));
            await git.checkout(targetBranch);
            await git.reset(['--hard', `origin/${targetBranch}`]);
            await git.clean('f', ['-d']);
            return localPath;
        }

        // Clone fresh
        this.logger.log(`Cloning IAC repo: ${iac.name}`);
        await fs.mkdir(localPath, { recursive: true });

        const cloneGit = await this.createAuthGit('.', iac);
        if (branch) {
            await cloneGit.clone(iac.repoUrl, localPath, ['-b', branch]);
        } else {
            await cloneGit.clone(iac.repoUrl, localPath);
        }
        return localPath;
    }

    async extractChart(localPath: string, iacPath: string, chartTgz: Buffer): Promise<void> {
        const resolvedLocal = path.resolve(localPath);
        const fullPath = path.resolve(localPath, iacPath);
        if (!fullPath.startsWith(resolvedLocal + path.sep) && fullPath !== resolvedLocal) {
            throw new Error(`iacPath "${iacPath}" resolves outside the repository root`);
        }
        await this.chartService.extractTgz(chartTgz, fullPath);
    }

    async commitAndPush(localPath: string, iac: IacEntity, message: string, branch?: string | null): Promise<string> {
        const git = await this.createAuthGit(localPath, iac);
        await git.add('-A');

        // Check if there are changes to commit
        const status = await git.status();
        if (status.isClean()) {
            throw new Error('No changes to commit — chart is identical to the current IAC state');
        }

        await git.commit(message);
        const targetBranch = branch || (await this.getDefaultBranch(git));
        await git.push('origin', targetBranch);

        const log = await git.log({ maxCount: 1 });
        return log.latest!.hash;
    }

    async withRepoLock<T>(iac: IacEntity, branch: string | null, fn: (localPath: string) => Promise<T>): Promise<T> {
        return withMutex({
            key: ['iac-repo', iac.id],
            fn: async () => {
                const localPath = await this.ensureRepo(iac, branch);
                return fn(localPath);
            }
        });
    }

    private async getDefaultBranch(git: SimpleGit): Promise<string> {
        try {
            const remote = await git.remote(['show', 'origin']);
            const match = String(remote).match(/HEAD branch:\s*(.+)/);
            if (match) return match[1].trim();
        } catch {
            // fallback
        }
        return 'main';
    }
}
