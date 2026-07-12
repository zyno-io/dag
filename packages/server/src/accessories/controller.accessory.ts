import { createCachingParameterResolver, http, HttpUnauthorizedError, resolveEntityFromRequestJwt } from '@zyno-io/ts-server-foundation';

import { UserEntity } from '../entities/user.entity';

export const UserResolver = createCachingParameterResolver(UserEntity, async context => {
    try {
        return await resolveEntityFromRequestJwt(context, UserEntity);
    } catch {
        throw new HttpUnauthorizedError();
    }
});

/**
 * A controller whose routes may declare `user: UserEntity` as a parameter, resolved from the
 * request's JWT. Pair with UserAuthMiddleware to actually require a session.
 */
export function ApiController(path?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends { new (...args: any[]): unknown }>(target: T) {
        http.controller(path)(target);
        http.resolveParameter(UserEntity, UserResolver)(target);
        return target;
    };
}
