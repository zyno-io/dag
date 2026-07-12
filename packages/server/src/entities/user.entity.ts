import { BaseEntity, entity, HasDefault, PrimaryKey, Unique, UuidString } from '@zyno-io/ts-server-foundation';

export interface IGitLabSession {
    accessToken: string;
    refreshToken: string;
    /** Epoch millis at which accessToken expires. */
    expiresAt: number;
    /** Required by GitLab when exchanging a refresh token. */
    redirectUri: string;
}

@entity.name('users')
export class UserEntity extends BaseEntity {
    id!: UuidString & PrimaryKey;
    gitlabUserId!: string & Unique;
    username!: string;
    name!: string;
    avatarUrl!: string | null;
    gitlabSession!: IGitLabSession | null;
    createdAt: Date & HasDefault = new Date();
    lastLoginAt!: Date;
}
