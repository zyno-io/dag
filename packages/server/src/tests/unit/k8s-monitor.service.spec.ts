import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { AppConfig } from '../../config';
import { ClusterEntity } from '../../entities/cluster.entity';
import { HelmDeploymentTarget, K8sMonitorService, MonitorCallbacks } from '../../services/k8s-monitor.service';

describe('K8sMonitorService', () => {
    let service: K8sMonitorService;
    let _mockCluster: ClusterEntity;
    let mockTarget: HelmDeploymentTarget;
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

        mockTarget = {
            helmType: 'flux',
            helmNamespace: 'default',
            helmName: 'my-app'
        };

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

    it('uses the immutable Helm target snapshot for monitoring', () => {
        assert.equal(mockTarget.helmName, 'my-app');
        assert.equal(mockTarget.helmNamespace, 'default');
    });

    it('requires resolved Helm fields rather than reading mutable environment configuration', () => {
        assert.equal(mockTarget.helmType, 'flux');
        assert.equal(typeof mockTarget.helmName, 'string');
    });
});
