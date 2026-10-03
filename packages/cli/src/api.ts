import type { DeploymentTargetStatusEvent, DeployResponse, DeploymentStatusEvent } from '@zyno-io/dag-shared';

import { DEPLOYMENT_CONNECTION_TIMEOUT_MS } from '@zyno-io/dag-shared';
import { EventSource } from 'eventsource';

export interface AppInfoOptions {
    serverUrl: string;
    repoUrl: string;
    jobId: string;
    jobToken: string;
    environment?: string;
}

export async function getChart(options: AppInfoOptions): Promise<Buffer> {
    const { serverUrl, repoUrl, jobId, jobToken, environment } = options;
    const url = `${serverUrl.replace(/\/+$/, '')}/api/get/chart`;
    const body: Record<string, string> = { repoUrl, jobId, jobToken };
    if (environment) body.environment = environment;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Get chart request failed (${response.status}): ${body}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export async function getValues(options: AppInfoOptions): Promise<Record<string, unknown>> {
    const { serverUrl, repoUrl, jobId, jobToken, environment } = options;
    const url = `${serverUrl.replace(/\/+$/, '')}/api/get/values`;
    const body: Record<string, string> = { repoUrl, jobId, jobToken };
    if (environment) body.environment = environment;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Get values request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as Record<string, unknown>;
}

export interface DeployOptions {
    serverUrl: string;
    repoUrl: string;
    jobId: string;
    jobToken: string;
    environment?: string;
    version: string;
    chartBuffer: Buffer;
    /** @deprecated Ignored. Rollout budgets belong to server-side deployment targets. */
    timeout?: number;
}

export async function submitDeploy(options: DeployOptions): Promise<string> {
    const { serverUrl, repoUrl, jobId, jobToken, environment, version, chartBuffer } = options;

    const formData = new FormData();
    formData.append('repoUrl', repoUrl);
    formData.append('jobId', jobId);
    formData.append('jobToken', jobToken);
    if (environment) formData.append('environment', environment);
    formData.append('version', version);
    formData.append('chart', new Blob([new Uint8Array(chartBuffer)]), 'chart.tgz');

    const url = `${serverUrl.replace(/\/+$/, '')}/api/deploy`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEPLOYMENT_CONNECTION_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Deploy request failed (${response.status}): ${body}`);
        }

        const data: DeployResponse = await response.json();
        return data.deploymentId;
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error('DAG server did not respond to deployment submission within 30s. Deployment outcome is unknown.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export function streamDeploymentEvents(
    serverUrl: string,
    deploymentId: string,
    onEvent: (event: DeploymentStatusEvent) => void,
    onTargetEvent?: (event: DeploymentTargetStatusEvent) => void
): Promise<DeploymentStatusEvent> {
    return new Promise((resolve, reject) => {
        const url = `${serverUrl.replace(/\/+$/, '')}/api/deployments/${deploymentId}/events`;
        const es = new EventSource(url);

        // Liveness detection: if no event arrives within 30s (2x the 15s heartbeat),
        // treat the connection as dead
        let livenessTimer: ReturnType<typeof setTimeout>;

        function resetLivenessTimer() {
            clearTimeout(livenessTimer);
            livenessTimer = setTimeout(() => {
                es.close();
                reject(new Error('SSE connection lost (no event or heartbeat received within 30s). Deployment outcome is unknown.'));
            }, DEPLOYMENT_CONNECTION_TIMEOUT_MS);
        }

        resetLivenessTimer();

        es.addEventListener('heartbeat', () => {
            resetLivenessTimer();
        });

        es.addEventListener('status', (event: MessageEvent) => {
            resetLivenessTimer();

            try {
                const data = JSON.parse(event.data) as DeploymentStatusEvent;
                onEvent(data);

                if (data.status === 'deployed' || data.status === 'failed') {
                    clearTimeout(livenessTimer);
                    es.close();
                    resolve(data);
                }
            } catch {
                // Ignore parse errors
            }
        });

        es.addEventListener('target', (event: MessageEvent) => {
            resetLivenessTimer();

            try {
                const data = JSON.parse(event.data) as DeploymentTargetStatusEvent;
                onTargetEvent?.(data);
            } catch {
                // Ignore parse errors
            }
        });

        es.onerror = (_err: Event) => {
            clearTimeout(livenessTimer);
            es.close();
            reject(new Error('SSE connection error. Deployment outcome is unknown.'));
        };
    });
}
