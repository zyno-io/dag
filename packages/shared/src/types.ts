import type { DeploymentStatus, DeploymentTargetStatus } from './enums.js';

export const DEPLOYMENT_HEARTBEAT_INTERVAL_MS = 15_000;
export const DEPLOYMENT_CONNECTION_TIMEOUT_MS = 30_000;
export const MAX_DEPLOY_MONITOR_TIMEOUT_SECS = 2_147_483_647;

export function isValidDeployMonitorTimeout(value: number): boolean {
    return Number.isInteger(value) && value > 0 && value <= MAX_DEPLOY_MONITOR_TIMEOUT_SECS;
}

/** Immutable rollout destination and budget captured when a deployment is queued. */
export interface HelmDeploymentTarget {
    helmType: 'flux' | 'plain';
    helmNamespace: string;
    helmName: string;
    monitorTimeoutSecs: number;
}

export interface DeployResponse {
    deploymentId: string;
}

export interface DeploymentStatusEvent {
    status: DeploymentStatus;
    message: string;
    commitUrl?: string;
}

/** A live status update for one independently monitored cluster target. */
export interface DeploymentTargetStatusEvent {
    target: {
        id: string;
        clusterId: number;
        clusterName: string;
        monitorTimeoutSecs: number;
        status: DeploymentTargetStatus;
        message: string;
    };
}
