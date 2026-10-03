import * as k8s from '@kubernetes/client-node';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ClusterEntity } from '../../entities/cluster.entity';
import { HelmDeploymentTarget, K8sMonitorService } from '../../services/k8s-monitor.service';

const cluster = { id: 1, name: 'test-cluster', apiUrl: 'https://k8s.example.test' } as ClusterEntity;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function monitorWithApi(api: unknown): K8sMonitorService {
    const service = new K8sMonitorService({ info: () => {}, log: () => {}, warn: () => {}, error: () => {} } as any);
    (service as any).createKubeConfig = async () => ({ makeApiClient: () => api });
    return service;
}

function target(helmType: 'flux' | 'plain', monitorTimeoutSecs: number): HelmDeploymentTarget {
    return { helmType, helmNamespace: 'default', helmName: 'my-app', monitorTimeoutSecs };
}

const callbacks = { onStatusChange: async () => {} };

describe('K8sMonitorService target budgets', () => {
    it('lets a longer target succeed after an independent shorter target times out', async t => {
        t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
        const service = monitorWithApi({
            getNamespacedCustomObject: async () => ({ status: { conditions: [{ type: 'Reconciling', status: 'True' }] } }),
            listNamespacedSecret: async () => ({
                items: [
                    {
                        metadata: { labels: { version: '2', status: Date.now() >= 15000 ? 'deployed' : 'pending-upgrade' } },
                        data: { release: 'release' }
                    }
                ]
            })
        });
        const short = service.watchDeployment(cluster, target('flux', 10), callbacks);
        const shortFailure = assert.rejects(short, /after 10s/);
        let longFinished = false;
        const long = service.watchDeployment({ ...cluster, id: 2 } as ClusterEntity, target('plain', 20), callbacks).then(() => {
            longFinished = true;
        });
        await flush();
        for (let i = 0; i < 2; i++) {
            t.mock.timers.tick(5000);
            await flush();
        }
        await shortFailure;
        assert.equal(longFinished, false);
        t.mock.timers.tick(5000);
        await long;
        assert.equal(longFinished, true);
    });

    for (const helmType of ['flux', 'plain'] as const) {
        for (const detectRevision of [false, true]) {
            it(`expires the ${helmType} budget during a stalled ${detectRevision ? 'revision detection' : 'readiness'} request`, async t => {
                t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
                const stalled = () => new Promise<never>(() => {});
                const service = monitorWithApi({ getNamespacedCustomObject: stalled, listNamespacedSecret: stalled });
                const monitoring = service.watchDeployment(
                    cluster,
                    target(helmType, 5),
                    callbacks,
                    detectRevision ? { fluxRevision: 'old', plainVersion: 1 } : undefined
                );
                const failed = assert.rejects(monitoring, /Timeout waiting for .* after 5s/);
                await flush();
                t.mock.timers.tick(5000);
                await failed;
                assert.equal(Date.now(), 5000);
            });
        }

        it(`does not accept a ${helmType} success returned after the budget expires`, async t => {
            t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
            const api = {
                getNamespacedCustomObject: async () => {
                    t.mock.timers.tick(6000);
                    return { status: { conditions: [{ type: 'Ready', status: 'True' }] } };
                },
                listNamespacedSecret: async () => {
                    t.mock.timers.tick(6000);
                    return { items: [{ metadata: { labels: { status: 'deployed' } }, data: { release: 'release' } }] };
                }
            };
            const service = monitorWithApi(api);
            await assert.rejects(service.watchDeployment(cluster, target(helmType, 5), callbacks), /Timeout waiting for .* after 5s/);
        });

        it(`uses one ${helmType} budget across revision detection and readiness`, async t => {
            t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
            const service = monitorWithApi({
                getNamespacedCustomObject: async () => ({
                    status: { lastAttemptedRevision: Date.now() >= 5000 ? 'new' : 'old', conditions: [{ type: 'Reconciling', status: 'True' }] }
                }),
                listNamespacedSecret: async () => ({
                    items: [
                        { metadata: { labels: { version: Date.now() >= 5000 ? '2' : '1', status: 'pending-upgrade' } }, data: { release: 'release' } }
                    ]
                })
            });
            const monitoring = service.watchDeployment(cluster, target(helmType, 10), callbacks, { fluxRevision: 'old', plainVersion: 1 });
            const failed = assert.rejects(monitoring, /after 10s/);
            await flush();
            t.mock.timers.tick(5000);
            await flush();
            t.mock.timers.tick(5000);
            await failed;
        });

        it(`reports the ${helmType} target budget when revision detection times out`, async t => {
            t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
            const service = monitorWithApi({
                getNamespacedCustomObject: async () => ({ status: { lastAttemptedRevision: 'old' } }),
                listNamespacedSecret: async () => ({ items: [] })
            });
            const monitoring = service.watchDeployment(cluster, target(helmType, 5), callbacks, { fluxRevision: 'old', plainVersion: 1 });
            const failed = assert.rejects(monitoring, /Timeout waiting for .* after 5s/);
            await flush();
            t.mock.timers.tick(5000);
            await failed;
        });
    }

    it('aborts the Kubernetes transport when a polling request exhausts the budget', async t => {
        t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
        let signal: AbortSignal | undefined;
        const api = new k8s.CustomObjectsApi(
            k8s.createConfiguration({
                baseServer: new k8s.ServerConfiguration(cluster.apiUrl, {}),
                authMethods: {
                    default: {
                        getName: () => 'test-auth',
                        applySecurityAuthentication: async request => request.setHeaderParam('Authorization', 'Bearer test-token')
                    }
                },
                httpApi: {
                    send: request => {
                        assert.equal(request.getHeaders().Authorization, 'Bearer test-token');
                        signal = request.getSignal();
                        return new k8s.Observable(
                            new Promise<k8s.ResponseContext>((_resolve, reject) => {
                                signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
                            })
                        );
                    }
                }
            })
        );
        const service = monitorWithApi(api);
        const monitoring = service.watchDeployment(cluster, target('flux', 5), callbacks);
        const failed = assert.rejects(monitoring, /after 5s/);
        await flush();
        assert.equal(signal?.aborted, false);
        t.mock.timers.tick(5000);
        await failed;
        assert.equal(signal?.aborted, true);
    });

    it('retries a stalled request while the target still has budget', async t => {
        t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
        let requests = 0;
        const service = monitorWithApi({
            getNamespacedCustomObject: () => {
                requests++;
                if (requests === 1) return new Promise<never>(() => {});
                return Promise.resolve({ status: { conditions: [{ type: 'Ready', status: 'True' }] } });
            }
        });
        const monitoring = service.watchDeployment(cluster, target('flux', 60), callbacks);
        await flush();
        t.mock.timers.tick(30000);
        await flush();
        t.mock.timers.tick(5000);
        await monitoring;
        assert.equal(requests, 2);
    });

    it('does not overshoot a short budget by sleeping for the full polling interval', async t => {
        t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
        const service = monitorWithApi({ getNamespacedCustomObject: async () => ({ status: {} }) });
        const monitoring = service.watchDeployment(cluster, target('flux', 1), callbacks);
        const failed = assert.rejects(monitoring, /after 1s/);
        await flush();
        t.mock.timers.tick(1000);
        await failed;
        assert.equal(Date.now(), 1000);
    });

    it('rejects invalid snapshot budgets before polling Kubernetes', async () => {
        const service = monitorWithApi({});
        for (const budget of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
            await assert.rejects(service.watchDeployment(cluster, target('flux', budget), callbacks), /Invalid deployment target monitor timeout/);
        }
    });
});
