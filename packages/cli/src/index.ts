#!/usr/bin/env node

import { Command } from 'commander';
import { detectCIEnvironment } from './detect.js';
import { packageChart } from './chart.js';
import { submitDeploy, streamDeploymentEvents } from './api.js';
import { DeploymentDisplay } from './display.js';

const program = new Command();

program
    .name('dag-deploy')
    .description('Deploy applications via GitOps')
    .version('0.0.1')
    .argument('<chart-path>', 'Path to Helm chart directory or .tgz file')
    .option('--server <url>', 'DAG server URL (env: DAG_SERVER_URL)')
    .option('--repo <url>', 'Override auto-detected repo URL (env: DAG_REPO_URL)')
    .option('--job-id <id>', 'Override auto-detected job ID (env: DAG_JOB_ID)')
    .option('--job-token <token>', 'Override auto-detected job token (env: DAG_JOB_TOKEN)')
    .option('--deploy-version <version>', 'Deployment version (env: DAG_DEPLOY_VERSION)')
    .option('--timeout <seconds>', 'Deployment timeout in seconds (env: DAG_TIMEOUT)', '300')
    .action(async (chartPath: string, options: Record<string, string>) => {
        const display = new DeploymentDisplay();

        try {
            // Resolve server URL
            const serverUrl = options.server || process.env.DAG_SERVER_URL;
            if (!serverUrl) {
                throw new Error('Server URL required. Use --server or set DAG_SERVER_URL env var.');
            }

            // Resolve deploy version
            const version = options.deployVersion || process.env.DAG_DEPLOY_VERSION;
            if (!version) {
                throw new Error('Deploy version required. Use --deploy-version or set DAG_DEPLOY_VERSION env var.');
            }

            // Detect or use overrides for CI environment
            let repoUrl = options.repo || process.env.DAG_REPO_URL;
            let jobId = options.jobId || process.env.DAG_JOB_ID;
            let jobToken = options.jobToken || process.env.DAG_JOB_TOKEN;

            if (!repoUrl || !jobId || !jobToken) {
                const detected = detectCIEnvironment();
                repoUrl = repoUrl || detected.repoUrl;
                jobId = jobId || detected.jobId;
                jobToken = jobToken || detected.jobToken;
            }

            const timeout = parseInt(options.timeout || process.env.DAG_TIMEOUT || '300', 10);
            if (!Number.isFinite(timeout) || timeout <= 0) {
                throw new Error('Timeout must be a positive number of seconds.');
            }

            // Package chart
            display.start();
            display.update({ status: 'pending', message: 'Packaging chart...' });
            const chartBuffer = await packageChart(chartPath);

            // Submit deployment
            display.update({ status: 'pending', message: 'Submitting deployment...' });
            const deploymentId = await submitDeploy({
                serverUrl,
                repoUrl,
                jobId,
                jobToken,
                version,
                chartBuffer,
                timeout
            });

            // Stream events
            const finalEvent = await streamDeploymentEvents(serverUrl, deploymentId, timeout, event => display.update(event));

            if (finalEvent.status === 'failed') {
                process.exit(1);
            }
        } catch (err: unknown) {
            display.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    });

program.parse();
