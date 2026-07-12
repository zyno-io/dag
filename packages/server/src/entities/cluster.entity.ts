import { AutoIncrement, BaseEntity, DatabaseField, entity, HasDefault, PrimaryKey } from '@zyno-io/ts-server-foundation';

@entity.name('clusters')
export class ClusterEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    name!: string;
    apiUrl!: string;
    serviceAccountToken!: string & DatabaseField<{ type: 'text' }>;
    caCert!: (string & DatabaseField<{ type: 'text' }>) | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
