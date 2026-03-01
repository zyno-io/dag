import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';

@entity.name('clusters')
export class ClusterEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    name!: string;
    apiUrl!: string;
    serviceAccountToken!: string;
    caCert!: string | null;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
