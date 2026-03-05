#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { detectCIEnvironment } from './detect.js';
import { packageChart } from './chart.js';
import { submitDeploy, streamDeploymentEvents } from './api.js';
import { DeploymentDisplay } from './display.js';
import { deepMerge, setNestedValue } from './yaml-utils.js';

function collectKeyValue(val: string, acc: string[]): string[] {
    acc.push(val);
    return acc;
}

const program = new Command();

program
    .name('dag-deploy')
    .description('Deploy applications via GitOps')
    .argument('<chart-path>', 'Path to Helm chart directory or .tgz file')
    .option('--server <url>', 'DAG server URL (env: DAG_SERVER_URL)')
    .option('--repo <url>', 'Override auto-detected repo URL (env: DAG_REPO_URL)')
    .option('--job-id <id>', 'Override auto-detected job ID (env: DAG_JOB_ID)')
    .option('--job-token <token>', 'Override auto-detected job token (env: DAG_JOB_TOKEN)')
    .option('--deploy-version <version>', 'Deployment version (env: DAG_DEPLOY_VERSION)')
    .option('--timeout <seconds>', 'Deployment timeout in seconds (env: DAG_TIMEOUT)', '300')
    .option('--values-file <path>', 'YAML file to merge into the chart values.yaml')
    .option('--set <key=value>', 'Set a dotted path to a literal string value (repeatable)', collectKeyValue, [])
    .option('--set-json <key=json>', 'Set a dotted path to a JSON-parsed value (repeatable)', collectKeyValue, [])
    .option('--set-file <key=filepath>', 'Set a dotted path to the contents of a file (repeatable)', collectKeyValue, [])
    .action(async (chartPath: string, options: Record<string, unknown>) => {
        const display = new DeploymentDisplay();

        try {
            // Resolve server URL
            const serverUrl = (options.server as string | undefined) || process.env.DAG_SERVER_URL;
            if (!serverUrl) {
                throw new Error('Server URL required. Use --server or set DAG_SERVER_URL env var.');
            }

            // Resolve deploy version
            const version = (options.deployVersion as string | undefined) || process.env.DAG_DEPLOY_VERSION;
            if (!version) {
                throw new Error('Deploy version required. Use --deploy-version or set DAG_DEPLOY_VERSION env var.');
            }

            // Detect or use overrides for CI environment
            let repoUrl = (options.repo as string | undefined) || process.env.DAG_REPO_URL;
            let jobId = (options.jobId as string | undefined) || process.env.DAG_JOB_ID;
            let jobToken = (options.jobToken as string | undefined) || process.env.DAG_JOB_TOKEN;

            if (!repoUrl || !jobId || !jobToken) {
                const detected = detectCIEnvironment();
                repoUrl = repoUrl || detected.repoUrl;
                jobId = jobId || detected.jobId;
                jobToken = jobToken || detected.jobToken;
            }

            const timeout = parseInt((options.timeout as string | undefined) || process.env.DAG_TIMEOUT || '300', 10);
            if (!Number.isFinite(timeout) || timeout <= 0) {
                throw new Error('Timeout must be a positive number of seconds.');
            }

            // Apply values overrides if any
            const set = options.set as string[];
            const setJson = options.setJson as string[];
            const setFile = options.setFile as string[];
            const hasValuesOverrides = options.valuesFile || set.length > 0 || setJson.length > 0 || setFile.length > 0;
            if (hasValuesOverrides) {
                const resolvedChartPath = path.resolve(chartPath);
                if (!fs.statSync(resolvedChartPath).isDirectory()) {
                    throw new Error('--values-file, --set, --set-json, and --set-file require a chart directory, not a .tgz file.');
                }

                const chartValuesPath = path.join(resolvedChartPath, 'values.yaml');
                if (!fs.existsSync(chartValuesPath)) {
                    throw new Error(`Chart values.yaml not found: ${chartValuesPath}`);
                }

                const content = fs.readFileSync(chartValuesPath, 'utf-8');
                const loaded = yaml.load(content);
                let doc: Record<string, unknown> =
                    loaded !== null && typeof loaded === 'object' && !Array.isArray(loaded) ? (loaded as Record<string, unknown>) : {};

                // Merge values file first
                if (options.valuesFile) {
                    const valuesFilePath = path.resolve(options.valuesFile as string);
                    if (!fs.existsSync(valuesFilePath)) {
                        throw new Error(`Values file not found: ${valuesFilePath}`);
                    }
                    const overlayContent = fs.readFileSync(valuesFilePath, 'utf-8');
                    const overlayLoaded = yaml.load(overlayContent);
                    if (overlayLoaded === null || overlayLoaded === undefined || typeof overlayLoaded !== 'object' || Array.isArray(overlayLoaded)) {
                        throw new Error(`Values file must contain a YAML mapping: ${valuesFilePath}`);
                    }
                    doc = deepMerge(doc, overlayLoaded as Record<string, unknown>);
                }

                // Apply --set overrides
                for (const entry of set) {
                    const eqIdx = entry.indexOf('=');
                    if (eqIdx === -1) {
                        throw new Error(`Invalid --set format: ${entry} (expected key=value)`);
                    }
                    setNestedValue(doc, entry.substring(0, eqIdx), entry.substring(eqIdx + 1));
                }

                // Apply --set-json overrides
                for (const entry of setJson) {
                    const eqIdx = entry.indexOf('=');
                    if (eqIdx === -1) {
                        throw new Error(`Invalid --set-json format: ${entry} (expected key=json)`);
                    }
                    const key = entry.substring(0, eqIdx);
                    const jsonStr = entry.substring(eqIdx + 1);
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(jsonStr);
                    } catch {
                        throw new Error(`Invalid JSON for --set-json key "${key}": ${jsonStr}`);
                    }
                    setNestedValue(doc, key, parsed);
                }

                // Apply --set-file overrides
                for (const entry of setFile) {
                    const eqIdx = entry.indexOf('=');
                    if (eqIdx === -1) {
                        throw new Error(`Invalid --set-file format: ${entry} (expected key=filepath)`);
                    }
                    const key = entry.substring(0, eqIdx);
                    const filePath = path.resolve(entry.substring(eqIdx + 1));
                    if (!fs.existsSync(filePath)) {
                        throw new Error(`File not found for --set-file: ${filePath}`);
                    }
                    setNestedValue(doc, key, fs.readFileSync(filePath, 'utf-8'));
                }

                // Write back
                fs.writeFileSync(chartValuesPath, yaml.dump(doc, { lineWidth: -1 }), 'utf-8');
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
