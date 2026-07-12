import { createAuthMiddleware } from '@zyno-io/ts-server-foundation';

import { UserEntity } from '../entities/user.entity';

/** Requires a valid session JWT resolving to a known user. */
export class UserAuthMiddleware extends createAuthMiddleware(UserEntity) {}
