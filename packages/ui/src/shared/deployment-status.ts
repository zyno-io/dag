import type { DeploymentStatus } from '@/openapi-client-generated';

// Re-exported so screens import the status type from one place. The union itself comes from
// @zyno-io/dag-shared, through the server's OpenAPI schema, into the generated client.
export type { DeploymentStatus };

/** Statuses a deployment can still move on from — the ones worth streaming. */
export const IN_FLIGHT_STATUSES: DeploymentStatus[] = ['pending', 'validating', 'pushing', 'pushed', 'monitoring'];

export const TERMINAL_STATUSES: DeploymentStatus[] = ['deployed', 'failed'];

export function isTerminal(status: DeploymentStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
}
