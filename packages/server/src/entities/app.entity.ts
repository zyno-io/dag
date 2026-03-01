import { AutoIncrement, entity, PrimaryKey } from '@deepkit/type';
import { BaseEntity, HasDefault } from '@zyno-io/dk-server-foundation';
import type { GitProvider } from '@zyno-io/dag-shared';

@entity.name('apps')
export class AppEntity extends BaseEntity {
    id!: number & AutoIncrement & PrimaryKey;
    gitProvider!: GitProvider;
    repoUrl!: string;
    createdAt: Date & HasDefault = new Date();
    updatedAt: Date & HasDefault = new Date();
}
