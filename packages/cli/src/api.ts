import type { DeployResponse, DeploymentStatusEvent } from '@zyno-io/dag-shared';
import { EventSource } from 'eventsource';

export interface AppInfoOptions {
    serverUrl: string;
    repoUrl: string;
    jobId: string;
    jobToken: string;
}

export async function getChart(options: AppInfoOptions): Promise<Buffer> {
    const { serverUrl, repoUrl, jobId, jobToken } = options;
    const url = `${serverUrl.replace(/\/+$/, '')}/api/get/chart`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, jobId, jobToken })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Get chart request failed (${response.status}): ${body}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export async function getValues(options: AppInfoOptions): Promise<Record<string, unknown>> {
    const { serverUrl, repoUrl, jobId, jobToken } = options;
    const url = `${serverUrl.replace(/\/+$/, '')}/api/get/values`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, jobId, jobToken })
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
    version: string;
    chartBuffer: Buffer;
    timeout: number;
}

export async function submitDeploy(options: DeployOptions): Promise<string> {
    const { serverUrl, repoUrl, jobId, jobToken, version, chartBuffer } = options;

    const formData = new FormData();
    formData.append('repoUrl', repoUrl);
    formData.append('jobId', jobId);
    formData.append('jobToken', jobToken);
    formData.append('version', version);
    formData.append('chart', new Blob([new Uint8Array(chartBuffer)]), 'chart.tgz');

    const url = `${serverUrl.replace(/\/+$/, '')}/api/deploy`;

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Deploy request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as DeployResponse;
    return data.deploymentId;
}

export function streamDeploymentEvents(
    serverUrl: string,
    deploymentId: string,
    timeout: number,
    onEvent: (event: DeploymentStatusEvent) => void
): Promise<DeploymentStatusEvent> {
    return new Promise((resolve, reject) => {
        const url = `${serverUrl.replace(/\/+$/, '')}/api/deployments/${deploymentId}/events`;
        const es = new EventSource(url);

        // Add a 30s grace period beyond the requested timeout so the server's
        // own timeout (which carries a detailed error message) has time to arrive
        // before we fall back to a generic client-side timeout.
        const timer = setTimeout(
            () => {
                es.close();
                reject(new Error(`Deployment timed out after ${timeout}s`));
            },
            (timeout + 30) * 1000
        );

        // Liveness detection: if no event arrives within 30s (2x the 15s heartbeat),
        // treat the connection as dead
        const LIVENESS_TIMEOUT = 30_000;
        let livenessTimer: ReturnType<typeof setTimeout>;

        function resetLivenessTimer() {
            clearTimeout(livenessTimer);
            livenessTimer = setTimeout(() => {
                clearTimeout(timer);
                es.close();
                reject(new Error('SSE connection lost (no heartbeat received)'));
            }, LIVENESS_TIMEOUT);
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
                    clearTimeout(timer);
                    clearTimeout(livenessTimer);
                    es.close();
                    resolve(data);
                }
            } catch {
                // Ignore parse errors
            }
        });

        es.onerror = (_err: Event) => {
            clearTimeout(timer);
            clearTimeout(livenessTimer);
            es.close();
            reject(new Error('SSE connection error'));
        };
    });
}
