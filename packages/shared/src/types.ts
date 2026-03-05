import type { DeploymentStatus } from './enums.js';

export interface DeployResponse {
    deploymentId: string;
}

export interface DeploymentStatusEvent {
    status: DeploymentStatus;
    message: string;
    commitUrl?: string;
}
