import * as tar from 'tar';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export class ChartService {
    async extractTgz(tgzBuffer: Buffer, destPath: string): Promise<void> {
        // Ensure destination exists and is clean
        await fs.rm(destPath, { recursive: true, force: true });
        await fs.mkdir(destPath, { recursive: true });

        // Extract to a temp directory first to handle nested chart dirs
        const tempDir = `${destPath}.__extract_temp`;
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.mkdir(tempDir, { recursive: true });

        try {
            const resolvedTemp = path.resolve(tempDir);
            await pipeline(
                Readable.from(tgzBuffer),
                tar.extract({
                    cwd: tempDir,
                    filter: entryPath => {
                        // Reject paths that traverse outside the destination
                        const resolved = path.resolve(resolvedTemp, entryPath);
                        return resolved.startsWith(resolvedTemp + path.sep) || resolved === resolvedTemp;
                    },
                    noMtime: true
                })
            );

            // Handle nested directory: if extract produced a single subdirectory, move its contents up
            const entries = await fs.readdir(tempDir);
            if (entries.length === 1) {
                const singleEntry = path.join(tempDir, entries[0]);
                const stat = await fs.stat(singleEntry);
                if (stat.isDirectory()) {
                    // Move contents of the single directory to destPath
                    const innerEntries = await fs.readdir(singleEntry);
                    for (const entry of innerEntries) {
                        await fs.rename(path.join(singleEntry, entry), path.join(destPath, entry));
                    }
                    await fs.rm(tempDir, { recursive: true });
                    return;
                }
            }

            // Otherwise move all extracted contents to destPath
            for (const entry of entries) {
                await fs.rename(path.join(tempDir, entry), path.join(destPath, entry));
            }
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
    }

    async updateChartVersion(chartDir: string, version: string): Promise<void> {
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        try {
            const content = await fs.readFile(chartYamlPath, 'utf-8');
            const updated = content.replace(/^version:\s*.+$/m, `version: ${version}`);
            await fs.writeFile(chartYamlPath, updated, 'utf-8');
        } catch (err: unknown) {
            if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw err;
        }
    }
}
