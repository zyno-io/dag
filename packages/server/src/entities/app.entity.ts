import { AutoIncrement, entity, PrimaryKey, Unique } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';
@entity.name('apps')
export class AppEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    gitProvider!: 'gitlab' | 'github';
    repoUrl!: string & Unique;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
