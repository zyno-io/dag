import { entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault, UuidString, uuid7 } from '@zyno-io/dk-server-foundation';
import type { DeploymentStatus } from '@zyno-io/dag-shared';

@entity.name('deployments')
export class DeploymentEntity extends BaseEntity {
    id: UuidString & PrimaryKey & HasDefault = uuid7() as UuidString;
    appEnvironmentId!: number;
    ciJobId!: string;
    commitSha!: string | null;
    version!: string;
    status: DeploymentStatus & HasDefault = 'pending';
    statusMessage!: string | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
