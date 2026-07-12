import { http } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { IacAuthService, IacRole } from '../services/iac-auth.service';

/** Note the absence of accessToken: it is never returned. */
interface IIacResponse {
    id: number;
    name: string;
    repoUrl: string;
    /** The caller's own role on this repo, as GitLab sees it — drives what the UI offers. */
    role: IacRole;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Read-only. IaC repositories are provisioned out of band (they hold the credentials that let
 * DAG write to your infrastructure), so this exists to populate pickers and to show a user
 * what they actually have access to.
 */
@ApiController('/api/iacs')
@http.middleware(UserAuthMiddleware)
export class IacsController {
    constructor(private iacAuth: IacAuthService) {}

    @http.GET()
    async index(user: UserEntity): Promise<IIacResponse[]> {
        const iacs = await IacEntity.query().orderBy('name').find();

        const results = await Promise.all(
            iacs.map(async iac => {
                const level = await this.iacAuth.getAccessLevel(user, iac);

                let role: IacRole | null = null;
                if (level === 'maintainer' || level === 'owner') role = 'manage';
                else if (level === 'developer') role = 'operate';
                else if (level === 'guest' || level === 'reporter') role = 'read';

                if (!role) return null;

                return {
                    id: iac.id,
                    name: iac.name,
                    repoUrl: iac.repoUrl,
                    role,
                    createdAt: iac.createdAt,
                    updatedAt: iac.updatedAt
                };
            })
        );

        return results.filter(iac => iac !== null);
    }
}
