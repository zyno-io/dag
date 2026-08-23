import { AutoIncrement, BaseEntity, entity, HasDefault, PrimaryKey } from '@zyno-io/ts-server-foundation';

/** One cluster/Helm destination configured for an application environment. */
@entity.name('apps_environment_targets')
export class AppEnvironmentTargetEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    appEnvironmentId!: number;
    clusterId!: number;
    helmType!: 'flux' | 'plain';
    /** Stored as the resolved value: Helm defaults are made explicit at configuration time. */
    helmNamespace!: string;
    /** Stored as the resolved value: Helm defaults are made explicit at configuration time. */
    helmName!: string;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
