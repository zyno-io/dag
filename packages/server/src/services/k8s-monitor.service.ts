import { ScopedLogger } from '@deepkit/logger';
import { decryptField } from '../helpers/crypto';
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

export interface PreDeploySnapshot {
    fluxRevision?: string;
    plainVersion?: number;
}

export class K8sMonitorService {
    constructor(
        private config: AppConfig,
        private logger: ScopedLogger
    ) {}

    async capturePreDeployState(cluster: ClusterEntity, appEnvironment: AppEnvironmentEntity): Promise<PreDeploySnapshot | null> {
        try {
            const kc = await this.createKubeConfig(cluster);
            const namespace = appEnvironment.helmNamespace ?? 'default';
            const helmName = appEnvironment.helmName ?? appEnvironment.iacPath.split('/').pop()!;

            if (appEnvironment.helmType === 'flux') {
                const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
                const response = await customApi.getNamespacedCustomObject({
                    group: 'helm.toolkit.fluxcd.io',
                    version: 'v2',
                    namespace,
                    plural: 'helmreleases',
                    name: helmName
                });
                const status = (response as Record<string, unknown>)?.status as Record<string, unknown> | undefined;
                return { fluxRevision: status?.lastAttemptedRevision as string | undefined };
            } else {
                const coreApi = kc.makeApiClient(k8s.CoreV1Api);
                const secrets = await coreApi.listNamespacedSecret({
                    namespace,
                    labelSelector: `name=${helmName},owner=helm`
                });
                let maxVersion = 0;
                for (const secret of secrets.items) {
                    const v = parseInt(secret.metadata?.labels?.['version'] ?? '0');
                    if (v > maxVersion) maxVersion = v;
                }
                return { plainVersion: maxVersion };
            }
        } catch (err) {
            this.logger.warn('Failed to capture pre-deploy state, skipping change detection:', err);
            return null;
        }
    }

    async watchDeployment(cluster: ClusterEntity, appEnvironment: AppEnvironmentEntity, callbacks: MonitorCallbacks, preDeploySnapshot?: PreDeploySnapshot | null): Promise<void> {
        const timeoutMs = this.config.DEPLOY_MONITOR_TIMEOUT_SECS * 1000;

        if (appEnvironment.helmType === 'flux') {
            await this.watchFluxHelmRelease(cluster, appEnvironment, callbacks, timeoutMs, preDeploySnapshot);
        } else {
            await this.watchPlainHelmRelease(cluster, appEnvironment, callbacks, timeoutMs, preDeploySnapshot);
        }
    }

    private async createKubeConfig(cluster: ClusterEntity): Promise<k8s.KubeConfig> {
        const token = await decryptField(cluster, 'serviceAccountToken');
        const kc = new k8s.KubeConfig();
        kc.loadFromOptions({
            clusters: [
                {
                    name: cluster.name,
                    server: cluster.apiUrl,
                    caData: cluster.caCert ? Buffer.from(cluster.caCert).toString('base64') : undefined
                }
            ],
            users: [
                {
                    name: 'service-account',
                    token
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
        timeoutMs: number,
        preDeploySnapshot?: PreDeploySnapshot | null
    ): Promise<void> {
        const kc = await this.createKubeConfig(cluster);
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
        const namespace = appEnvironment.helmNamespace ?? 'default';
        const helmReleaseName = appEnvironment.helmName ?? appEnvironment.iacPath.split('/').pop()!;
        const clusterLabel = `cluster ${cluster.id} (${cluster.apiUrl})`;

        this.logger.info(`Watching Flux HelmRelease ${namespace}/${helmReleaseName} on ${clusterLabel}`);

        const startTime = Date.now();

        // Phase 1: Wait for Flux to pick up the new revision
        if (preDeploySnapshot) {
            this.logger.info(`Waiting for Flux to detect new revision (current: ${preDeploySnapshot.fluxRevision ?? 'none'})`);
            await callbacks.onStatusChange(`Waiting for Flux to detect new chart version...`);

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
                    const currentRevision = status?.lastAttemptedRevision as string | undefined;

                    if (currentRevision !== preDeploySnapshot.fluxRevision) {
                        this.logger.info(`Flux detected new revision: ${currentRevision} (was: ${preDeploySnapshot.fluxRevision ?? 'none'})`);
                        await callbacks.onStatusChange(`Flux detected new chart version, waiting for reconciliation...`);
                        break;
                    }
                } catch (err) {
                    this.logger.warn(`Error during change detection for ${namespace}/${helmReleaseName}:`, err);
                }

                await callbacks.onStatusChange(`Waiting for Flux to detect new chart version...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            if (Date.now() - startTime >= timeoutMs) {
                throw new Error(`Timeout waiting for Flux to detect new revision for ${helmReleaseName} on ${clusterLabel} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
            }
        }

        // Phase 2: Wait for ready
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
                const reconcilingCondition = conditions.find(c => c.type === 'Reconciling');

                const readyStatus = readyCondition?.status ?? 'n/a';
                const reconcilingStatus = reconcilingCondition?.status ?? 'n/a';
                this.logger.log(`HelmRelease ${namespace}/${helmReleaseName} conditions: Ready=${readyStatus}, Reconciling=${reconcilingStatus}`);

                if (readyCondition) {
                    if (readyCondition.status === 'True') {
                        this.logger.info(`HelmRelease ${namespace}/${helmReleaseName} reconciled successfully on ${clusterLabel}`);
                        await callbacks.onStatusChange(`HelmRelease ${helmReleaseName} reconciled successfully on ${cluster.name}`);
                        return;
                    }

                    if (readyCondition.status === 'False' && !reconcilingCondition) {
                        this.logger.error(`HelmRelease ${namespace}/${helmReleaseName} failed on ${clusterLabel}: ${readyCondition.message}`);
                        throw new HelmReleaseFailedError(`HelmRelease failed: ${readyCondition.message}`);
                    }
                }

                await callbacks.onStatusChange(`HelmRelease ${helmReleaseName} on ${cluster.name}: Ready=${readyStatus}, Reconciling=${reconcilingStatus}`);
            } catch (err: unknown) {
                if (err instanceof HelmReleaseFailedError) {
                    throw err;
                } else if (err instanceof Error && 'code' in err && (err as Record<string, unknown>).code === 404) {
                    this.logger.log(`HelmRelease ${namespace}/${helmReleaseName} not found yet on ${clusterLabel}`);
                    await callbacks.onStatusChange(`HelmRelease ${helmReleaseName} not found yet on ${cluster.name}`);
                } else {
                    this.logger.warn(`Error polling HelmRelease ${namespace}/${helmReleaseName} on ${clusterLabel}:`, err);
                    await callbacks.onStatusChange(`Error polling HelmRelease ${helmReleaseName} on ${cluster.name}, retrying...`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error(`Timeout waiting for HelmRelease ${helmReleaseName} on ${clusterLabel} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
    }

    private async watchPlainHelmRelease(
        cluster: ClusterEntity,
        appEnvironment: AppEnvironmentEntity,
        callbacks: MonitorCallbacks,
        timeoutMs: number,
        preDeploySnapshot?: PreDeploySnapshot | null
    ): Promise<void> {
        const kc = await this.createKubeConfig(cluster);
        const coreApi = kc.makeApiClient(k8s.CoreV1Api);
        const namespace = appEnvironment.helmNamespace ?? 'default';
        const helmName = appEnvironment.helmName ?? appEnvironment.iacPath.split('/').pop()!;
        const clusterLabel = `cluster ${cluster.id} (${cluster.apiUrl})`;

        this.logger.info(`Watching plain Helm release ${namespace}/${helmName} on ${clusterLabel}`);

        const startTime = Date.now();

        // Phase 1: Wait for new Helm release version
        if (preDeploySnapshot?.plainVersion !== undefined) {
            this.logger.info(`Waiting for new Helm release version (current: v${preDeploySnapshot.plainVersion})`);
            await callbacks.onStatusChange(`Waiting for new Helm release version (current: v${preDeploySnapshot.plainVersion})...`);

            while (Date.now() - startTime < timeoutMs) {
                try {
                    const secrets = await coreApi.listNamespacedSecret({
                        namespace,
                        labelSelector: `name=${helmName},owner=helm`
                    });
                    let maxVersion = 0;
                    for (const secret of secrets.items) {
                        const v = parseInt(secret.metadata?.labels?.['version'] ?? '0');
                        if (v > maxVersion) maxVersion = v;
                    }

                    if (maxVersion > preDeploySnapshot.plainVersion) {
                        this.logger.info(`New Helm release version detected: v${maxVersion} (was: v${preDeploySnapshot.plainVersion})`);
                        await callbacks.onStatusChange(`New Helm release version v${maxVersion} detected, checking status...`);
                        break;
                    }
                } catch (err) {
                    this.logger.warn(`Error during change detection for ${namespace}/${helmName}:`, err);
                }

                await callbacks.onStatusChange(`Waiting for new Helm release version (current: v${preDeploySnapshot.plainVersion})...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            if (Date.now() - startTime >= timeoutMs) {
                throw new Error(`Timeout waiting for new Helm release version for ${helmName} on ${clusterLabel} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
            }
        }

        // Phase 2: Wait for deployed status
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
                        const status = latest.metadata?.labels?.['status'];
                        const version = latest.metadata?.labels?.['version'] ?? '?';
                        this.logger.log(`Helm release ${namespace}/${helmName} v${version} status=${status} on ${clusterLabel}`);

                        if (status === 'deployed') {
                            this.logger.info(`Helm release ${namespace}/${helmName} deployed successfully on ${clusterLabel}`);
                            await callbacks.onStatusChange(`Helm release ${helmName} deployed successfully on ${cluster.name}`);
                            return;
                        }
                        if (status === 'failed') {
                            this.logger.error(`Helm release ${namespace}/${helmName} failed on ${clusterLabel}`);
                            throw new HelmReleaseFailedError(`Helm release ${helmName} failed`);
                        }

                        await callbacks.onStatusChange(`Helm release ${helmName} v${version} on ${cluster.name}: ${status}`);
                    } else {
                        await callbacks.onStatusChange(`Helm release ${helmName} found on ${cluster.name}, waiting for status...`);
                    }
                } else {
                    this.logger.log(`No Helm release secrets found for ${namespace}/${helmName} on ${clusterLabel}`);
                    await callbacks.onStatusChange(`Helm release ${helmName} not found yet on ${cluster.name}`);
                }
            } catch (err: unknown) {
                if (err instanceof HelmReleaseFailedError) {
                    throw err;
                }
                this.logger.warn(`Error polling Helm release ${namespace}/${helmName} on ${clusterLabel}:`, err);
                await callbacks.onStatusChange(`Error polling Helm release ${helmName} on ${cluster.name}, retrying...`);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error(`Timeout waiting for Helm release ${helmName} on ${clusterLabel} after ${this.config.DEPLOY_MONITOR_TIMEOUT_SECS}s`);
    }
}
