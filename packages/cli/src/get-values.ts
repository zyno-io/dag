#!/usr/bin/env node

import { Command } from 'commander';
import { detectCIEnvironment } from './detect.js';
import { getValues } from './api.js';

const program = new Command();

program
    .name('dag-get-values')
    .description('Fetch the currently deployed values from the IaC repo')
    .option('--server <url>', 'DAG server URL (env: DAG_SERVER_URL)')
    .option('--repo <url>', 'Override auto-detected repo URL (env: DAG_REPO_URL)')
    .option('--job-id <id>', 'Override auto-detected job ID (env: DAG_JOB_ID)')
    .option('--job-token <token>', 'Override auto-detected job token (env: DAG_JOB_TOKEN)')
    .action(async (options: Record<string, unknown>) => {
        try {
            const serverUrl = (options.server as string | undefined) || process.env.DAG_SERVER_URL;
            if (!serverUrl) {
                throw new Error('Server URL required. Use --server or set DAG_SERVER_URL env var.');
            }

            let repoUrl = (options.repo as string | undefined) || process.env.DAG_REPO_URL;
            let jobId = (options.jobId as string | undefined) || process.env.DAG_JOB_ID;
            let jobToken = (options.jobToken as string | undefined) || process.env.DAG_JOB_TOKEN;

            if (!repoUrl || !jobId || !jobToken) {
                const detected = detectCIEnvironment();
                repoUrl = repoUrl || detected.repoUrl;
                jobId = jobId || detected.jobId;
                jobToken = jobToken || detected.jobToken;
            }

            const values = await getValues({ serverUrl, repoUrl, jobId, jobToken });
            console.log(JSON.stringify(values, null, 2));
        } catch (err: unknown) {
            console.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

program.parse();
