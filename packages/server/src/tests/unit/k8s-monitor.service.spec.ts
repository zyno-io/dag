import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { K8sMonitorService, MonitorCallbacks } from '../../services/k8s-monitor.service';
import { AppEnvironmentEntity } from '../../entities/app-environment.entity';
import { ClusterEntity } from '../../entities/cluster.entity';
import { AppConfig } from '../../config';

describe('K8sMonitorService', () => {
    let service: K8sMonitorService;
    let _mockCluster: ClusterEntity;
    let mockAppEnvironment: AppEnvironmentEntity;
    let messages: string[];
    let _callbacks: MonitorCallbacks;

    beforeEach(() => {
        const config = new AppConfig();
        config.DEPLOY_MONITOR_TIMEOUT_SECS = 2;

        const logger = { log: () => {}, warn: () => {}, error: () => {} } as any;

        service = new K8sMonitorService(config, logger);

        _mockCluster = {
            id: 1,
            name: 'test-cluster',
            apiUrl: 'https://k8s.example.com:6443',
            serviceAccountToken: 'test-token',
            caCert: null
        } as ClusterEntity;

        mockAppEnvironment = {
            id: 1,
            helmType: 'flux',
            helmNamespace: 'default',
            helmName: 'my-app',
            iacPath: 'charts/my-app'
        } as AppEnvironmentEntity;

        messages = [];
        _callbacks = {
            onStatusChange: async msg => {
                messages.push(msg);
            }
        };
    });

    it('should be constructable with correct interface', () => {
        assert.ok(service);
        assert.equal(typeof service.watchDeployment, 'function');
    });

    it('should use helmName for monitoring when provided', () => {
        assert.equal(mockAppEnvironment.helmName, 'my-app');
    });

    it('should fall back to iacPath basename when helmName is null', () => {
        mockAppEnvironment.helmName = null;
        const fallbackName = mockAppEnvironment.iacPath.split('/').pop();
        assert.equal(fallbackName, 'my-app');
    });
});
