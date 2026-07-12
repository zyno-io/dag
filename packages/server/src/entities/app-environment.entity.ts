import { AutoIncrement, BaseEntity, entity, HasDefault, PrimaryKey } from '@zyno-io/ts-server-foundation';
@entity.name('apps_environments')
@entity.index(['appId', 'branch', 'name'], { unique: true })
export class AppEnvironmentEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    appId!: number;
    branch!: string;
    name!: string;
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
