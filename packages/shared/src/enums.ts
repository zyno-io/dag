export type GitProvider = 'gitlab' | 'github';

export type HelmType = 'flux' | 'plain';

export type DeploymentStatus = 'pending' | 'validating' | 'pushing' | 'pushed' | 'monitoring' | 'deployed' | 'failed';

/** The monitoring lifecycle of one cluster target within a deployment. */
export type DeploymentTargetStatus = 'pending' | 'monitoring' | 'deployed' | 'failed';
