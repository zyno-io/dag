import type { DeploymentStatus, DeploymentTargetStatus } from './enums.js';

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
        status: DeploymentTargetStatus;
        message: string;
    };
}
