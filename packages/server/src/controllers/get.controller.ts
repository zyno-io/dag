import { http, HttpBody, HttpBadRequestError, HttpNotFoundError, HttpResponse } from '@deepkit/http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { IacEntity } from '../entities/iac.entity';
import { AppAuthService } from '../services/app-auth.service';
import { ChartService } from '../services/chart.service';
import { IacRepoService } from '../services/iac-repo.service';

interface GetBody {
    repoUrl: string;
    jobId: string;
    jobToken: string;
}

function resolveIacPath(localPath: string, iacPath: string): string {
    const resolvedLocal = path.resolve(localPath);
    const fullPath = path.resolve(localPath, iacPath);
    if (!fullPath.startsWith(resolvedLocal + path.sep) && fullPath !== resolvedLocal) {
        throw new HttpBadRequestError(`iacPath "${iacPath}" resolves outside the repository root`);
    }
    return fullPath;
}

@http.controller('/api/get')
export class GetController {
    constructor(
        private appAuthService: AppAuthService,
        private chartService: ChartService,
        private iacRepoService: IacRepoService
    ) {}

    @http.POST('chart')
    async getChart(body: HttpBody<GetBody>, response: HttpResponse): Promise<void> {
        const { repoUrl, jobId, jobToken } = body;

        if (!repoUrl || !jobId || !jobToken) {
            throw new HttpBadRequestError('Missing required fields: repoUrl, jobId, jobToken');
        }

        const { appEnvironment } = await this.appAuthService.authenticateAndResolve(repoUrl, jobId, jobToken);
        const iac = await IacEntity.query().filterField('id', appEnvironment.iacId).findOne();

        const buffer = await this.iacRepoService.withRepoLock(iac, appEnvironment.iacBranch, async localPath => {
            const chartDir = resolveIacPath(localPath, appEnvironment.iacPath);
            const exists = await fs.stat(chartDir).then(
                s => s.isDirectory(),
                () => false
            );
            if (!exists) {
                throw new HttpNotFoundError(`Chart directory not found at IaC path: ${appEnvironment.iacPath}`);
            }
            return this.chartService.createTgz(chartDir);
        });

        response.setHeader('Content-Type', 'application/gzip');
        response.setHeader('Content-Disposition', 'attachment; filename="chart.tgz"');
        response.end(buffer);
    }

    @http.POST('values')
    async getValues(body: HttpBody<GetBody>, response: HttpResponse): Promise<void> {
        const { repoUrl, jobId, jobToken } = body;

        if (!repoUrl || !jobId || !jobToken) {
            throw new HttpBadRequestError('Missing required fields: repoUrl, jobId, jobToken');
        }

        const { appEnvironment } = await this.appAuthService.authenticateAndResolve(repoUrl, jobId, jobToken);
        const iac = await IacEntity.query().filterField('id', appEnvironment.iacId).findOne();

        const values = await this.iacRepoService.withRepoLock(iac, appEnvironment.iacBranch, async localPath => {
            const valuesDir = resolveIacPath(localPath, appEnvironment.iacPath);
            const valuesPath = path.join(valuesDir, 'values.yaml');
            let content: string;
            try {
                content = await fs.readFile(valuesPath, 'utf-8');
            } catch (err: unknown) {
                if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                    throw new HttpNotFoundError(`values.yaml not found at IaC path: ${appEnvironment.iacPath}`);
                }
                throw err;
            }
            let parsed: unknown;
            try {
                parsed = yaml.load(content);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                throw new HttpBadRequestError(`Failed to parse values.yaml: ${message}`);
            }
            if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }
            return parsed;
        });

        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(values));
    }
}
