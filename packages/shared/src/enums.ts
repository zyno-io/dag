export type GitProvider = 'gitlab' | 'github';

export type HelmType = 'flux' | 'plain';

export type DeploymentStatus = 'pending' | 'validating' | 'pushing' | 'pushed' | 'monitoring' | 'deployed' | 'failed';
