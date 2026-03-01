import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';
import type { HelmType } from '@zyno-io/dag-shared';

@entity.name('apps_environments')
export class AppEnvironmentEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    appId!: number;
    branch!: string;
    iacId!: number;
    iacPath!: string;
    clusterId!: number;
    helmType!: HelmType;
    helmNamespace!: string | null;
    helmName!: string | null;
    iacBranch!: string | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
