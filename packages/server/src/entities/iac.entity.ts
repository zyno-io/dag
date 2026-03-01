import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';

@entity.name('iacs')
export class IacEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    name!: string;
    repoUrl!: string;
    accessToken!: string;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
