import { entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault, UuidString, uuid7 } from '@zyno-io/dk-server-foundation';
@entity.name('apps_deployments')
export class DeploymentEntity extends BaseEntity {
    id!: UuidString & PrimaryKey & HasDefault;
    appEnvironmentId!: number;
    ciJobId!: string;
    commitSha!: string | null;
    version!: string;
    status: ('pending' | 'validating' | 'pushing' | 'pushed' | 'monitoring' | 'deployed' | 'failed') & HasDefault = 'pending';
    statusMessage!: string | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
