import { HttpAccessDeniedError } from '@zyno-io/ts-server-foundation';

import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { GitLabProjectAuthService } from './gitlab-project-auth.service';
import { ProjectAccessLevel } from './gitlab.service';

export type IacRole = 'read' | 'operate' | 'manage';

const ROLE_RANK: Record<ProjectAccessLevel, number> = {
    none: 0,
    guest: 1,
    reporter: 2,
    developer: 3,
    maintainer: 4,
    owner: 5
};

const ROLE_REQUIREMENT: Record<IacRole, ProjectAccessLevel> = {
    read: 'guest',
    operate: 'developer',
    manage: 'maintainer'
};

/**
 * DAG has no local roles. What a user may do is decided entirely by their GitLab access to
 * the IaC repo an environment deploys into: the people who can change the infrastructure
 * repo are the people who may change what deploys into it.
 *
 * GitLab is asked once per user/repo and cached briefly, because this sits on every
 * app-scoped request.
 */
export class IacAuthService {
    constructor(private projectAuth: GitLabProjectAuthService) {}

    async getAccessLevel(user: UserEntity, iac: IacEntity): Promise<ProjectAccessLevel> {
        return this.projectAuth.getAccessLevel(user, iac.repoUrl);
    }

    async hasRole(user: UserEntity, iac: IacEntity, role: IacRole): Promise<boolean> {
        const level = await this.getAccessLevel(user, iac);
        return ROLE_RANK[level] >= ROLE_RANK[ROLE_REQUIREMENT[role]];
    }

    async requireRole(user: UserEntity, iac: IacEntity, role: IacRole): Promise<ProjectAccessLevel> {
        const level = await this.getAccessLevel(user, iac);
        if (ROLE_RANK[level] < ROLE_RANK[ROLE_REQUIREMENT[role]]) {
            throw new HttpAccessDeniedError(`Insufficient GitLab permissions on IaC repo "${iac.name}" (have=${level}, need=${role})`);
        }
        return level;
    }

    /** The IaC repos this user holds at least `role` on. */
    async filterIacs(user: UserEntity, iacs: IacEntity[], role: IacRole): Promise<IacEntity[]> {
        const allowed = await Promise.all(iacs.map(iac => this.hasRole(user, iac, role)));
        return iacs.filter((_, i) => allowed[i]);
    }

    /**
     * Clusters hold Kubernetes credentials and are shared infrastructure, so they are not
     * scoped to a single IaC repo. Whoever can `manage` any IaC repo is, by construction,
     * the infra team — that is the gate.
     */
    async requireOperator(user: UserEntity): Promise<void> {
        const iacs = await IacEntity.query().find();
        for (const iac of iacs) {
            if (await this.hasRole(user, iac, 'manage')) return;
        }
        throw new HttpAccessDeniedError('Requires maintainer access to at least one IaC repository');
    }
}
