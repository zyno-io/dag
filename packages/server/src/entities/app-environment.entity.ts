import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';
@entity.name('apps_environments')
@entity.index(['appId', 'branch'], { unique: true })
export class AppEnvironmentEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    appId!: number;
    branch!: string;
    iacId!: number;
    iacPath!: string;
    clusterId!: number;
    helmType!: 'flux' | 'plain';
    helmNamespace!: string | null;
    helmName!: string | null;
    iacBranch!: string | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
