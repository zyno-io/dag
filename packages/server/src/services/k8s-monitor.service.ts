import { ScopedLogger } from '@deepkit/logger';
import { Crypto } from '@zyno-io/dk-server-foundation';
import * as k8s from '@kubernetes/client-node';

import { AppConfig } from '../config';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';

class HelmReleaseFailedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HelmReleaseFailedError';
    }
}

export interface MonitorCallbacks {
    onStatusChange: (message: string) => Promise<void>;
}

export class K8sMonitorService {
    constructor(
        private config: AppConfig,
        private logger: ScopedLogger
    ) {}

    async watchDeployment(cluster: ClusterEntity, appEnvironment: AppEnvironmentEntity, callbacks: MonitorCallbacks): Promise<void> {
        const timeoutMs = this.config.DEPLOY_MONITOR_TIMEOUT_SECS * 1000;

        if (appEnvironment.helmType === 'flux') {
            await this.watchFluxHelmRelease(cluster, appEnvironment, callbacks, timeoutMs);
        } else {
            await this.watchPlainHelmRelease(cluster, appEnvironment, callbacks, timeoutMs);
        }
    }

    private createKubeConfig(cluster: ClusterEntity): k8s.KubeConfig {
        const kc = new k8s.KubeConfig();
        kc.loadFromOptions({
            clusters: [
                {
                    name: cluster.name,
                    server: cluster.apiUrl,
                    caData: cluster.caCert ?? undefined
                }
            ],
            users: [
                {
                    name: 'service-account',
                    token: Crypto.decrypt(cluster.serviceAccountToken)
                }
            ],
            contexts: [
                {
                    name: 'default',
                    cluster: cluster.name,
                    user: 'service-account'
                }
            ],
            currentContext: 'default'
        });
        return kc;
    }

    private async watchFluxHelmRelease(
        cluster: ClusterEntity,
        appEnvironment: AppEnvironmentEntity,
        callbacks: MonitorCallbacks,
        timeoutMs: number
    ): Promise<void> {
        const kc = this.createKubeConfig(cluster);
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
        const namespace = appEnvironment.helmNamespace ?? 'default';
        const helmReleaseName = appEnvironment.helmName ?? appEnvironment.iacPath.split('/').pop()!;

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await customApi.getNamespacedCustomObject({
                    group: 'helm.toolkit.fluxcd.io',
                    version: 'v2',
                    namespace,
                    plural: 'helmreleases',
                    name: helmReleaseName
                });

                const obj = response as Record<string, unknown>;
                const status = obj?.status as Record<string, unknown> | undefined;
                const conditions: Array<{ type: string; status: string; message: string }> =
                    (status?.conditions as Array<{ type: string; status: string; message: string }>) ?? [];

                const readyCondition = conditions.find(c => c.type === 'Ready');
                if (readyCondition) {
                    if (readyCondition.status === 'True') {
                        await callbacks.onStatusChange(`HelmRelease ${helmReleaseName} reconciled successfully`);
                        return;
                    }

                    // Check for failure
                    const reconcilingCondition = conditions.find(c => c.type === 'Reconciling');
                    if (readyCondition.status === 'False' && !reconcilingCondition) {
                        throw new HelmReleaseFailedError(`HelmRelease failed: ${readyCondition.message}`);
                    }
                }

                await callbacks.onStatusChange(`Waiting for HelmRelease ${helmReleaseName} in ${namespace}...`);
            } catch (err: unknown) {
                if (err instanceof HelmReleaseFailedError) {
                    throw err;
                } else if (err instanceof Error && 'code' in err && (err as Record<string, unknown>).code === 404) {
                    await callbacks.onStatusChange(`Waiting for HelmRelease ${helmReleaseName} to be created...`);
                } else {
                    this.logger.warn(`Error polling HelmRelease: ${err instanceof Error ? err.message : err}`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error(`Timeout waiting for HelmRelease ${helmReleaseName} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
    }

    private async watchPlainHelmRelease(
        cluster: ClusterEntity,
        appEnvironment: AppEnvironmentEntity,
        callbacks: MonitorCallbacks,
        timeoutMs: number
    ): Promise<void> {
        const kc = this.createKubeConfig(cluster);
        const coreApi = kc.makeApiClient(k8s.CoreV1Api);
        const namespace = appEnvironment.helmNamespace ?? 'default';
        const helmName = appEnvironment.helmName ?? appEnvironment.iacPath.split('/').pop()!;

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                // Helm stores release info as secrets with name pattern: sh.helm.release.v1.<name>.v<revision>
                const secrets = await coreApi.listNamespacedSecret({
                    namespace,
                    labelSelector: `name=${helmName},owner=helm`
                });

                if (secrets.items.length > 0) {
                    // Get the latest release secret (highest version)
                    const sorted = secrets.items.sort((a, b) => {
                        const vA = parseInt(a.metadata?.labels?.['version'] ?? '0');
                        const vB = parseInt(b.metadata?.labels?.['version'] ?? '0');
                        return vB - vA;
                    });

                    const latest = sorted[0];
                    const releaseData = latest.data?.['release'];
                    if (releaseData) {
                        // Helm release data is double-base64 then gzipped, but the status field
                        // can be checked via the label
                        const status = latest.metadata?.labels?.['status'];
                        if (status === 'deployed') {
                            await callbacks.onStatusChange(`Helm release ${helmName} deployed successfully`);
                            return;
                        }
                        if (status === 'failed') {
                            throw new HelmReleaseFailedError(`Helm release ${helmName} failed`);
                        }
                    }
                }

                await callbacks.onStatusChange(`Waiting for Helm release ${helmName} in ${namespace}...`);
            } catch (err: unknown) {
                if (err instanceof HelmReleaseFailedError) {
                    throw err;
                }
                this.logger.warn(`Error polling Helm release: ${err instanceof Error ? err.message : err}`);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error(`Timeout waiting for Helm release ${helmName} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
    }
}
