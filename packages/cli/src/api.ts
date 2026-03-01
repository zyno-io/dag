import type { DeployResponse, DeploymentStatusEvent } from '@zyno-io/dag-shared';
import { EventSource } from 'eventsource';

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

        const timer = setTimeout(() => {
            es.close();
            reject(new Error(`Deployment timed out after ${timeout}s`));
        }, timeout * 1000);

        es.addEventListener('status', (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data) as DeploymentStatusEvent;
                onEvent(data);

                if (data.status === 'deployed' || data.status === 'failed') {
                    clearTimeout(timer);
                    es.close();
                    resolve(data);
                }
            } catch {
                // Ignore parse errors
            }
        });

        es.onerror = (_err: Event) => {
            clearTimeout(timer);
            es.close();
            reject(new Error('SSE connection error'));
        };
    });
}
