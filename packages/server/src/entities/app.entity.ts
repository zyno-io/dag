import { AutoIncrement, BaseEntity, entity, HasDefault, PrimaryKey, Unique } from '@zyno-io/ts-server-foundation';
@entity.name('apps')
export class AppEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    gitProvider!: 'gitlab' | 'github';
    repoUrl!: string & Unique;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
