import * as tar from 'tar';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export async function packageChart(chartPath: string): Promise<Buffer> {
    const resolvedPath = path.resolve(chartPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Chart path does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
        // If it's already a .tgz file, just read it
        if (resolvedPath.endsWith('.tgz') || resolvedPath.endsWith('.tar.gz')) {
            return fs.readFileSync(resolvedPath);
        }
        throw new Error(`Chart path is not a directory or .tgz file: ${resolvedPath}`);
    }

    const entries = fs.readdirSync(resolvedPath);
    if (entries.length === 0) {
        throw new Error(`Chart directory is empty: ${resolvedPath}`);
    }

    // Package the directory as a .tgz
    const tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dag-chart-')), 'chart.tgz');

    try {
        await tar.create(
            {
                gzip: true,
                file: tempFile,
                cwd: path.dirname(resolvedPath)
            },
            [path.basename(resolvedPath)]
        );

        return fs.readFileSync(tempFile);
    } finally {
        fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
}
