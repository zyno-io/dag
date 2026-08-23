import { BaseEntity, entity, HasDefault, PrimaryKey, UuidString } from '@zyno-io/ts-server-foundation';

/**
 * Immutable monitoring destination and outcome for one cluster in a deployment.
 * The target fields are copied from the environment at queue time so later configuration edits
 * cannot redirect an in-flight deployment.
 */
@entity.name('apps_deployment_targets')
export class DeploymentTargetEntity extends BaseEntity {
    id!: UuidString & PrimaryKey & HasDefault;
    deploymentId!: string;
    environmentTargetId!: number | null;
    clusterId!: number;
    clusterName!: string;
    helmType!: 'flux' | 'plain';
    helmNamespace!: string;
    helmName!: string;
    status: ('pending' | 'monitoring' | 'deployed' | 'failed') & HasDefault = 'pending';
    statusMessage!: string | null;
    completedAt!: Date | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
