import { createPersistedEntity, http, HttpBadRequestError, HttpBody, HttpNotFoundError, persistEntity } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { Db } from '../database';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { AppAccessService } from '../services/app-access.service';

export interface IEnvironmentInput {
    name: string;
    branch: string;
    iacId: number;
    iacPath: string;
    iacBranch: string | null;
    clusterId: number;
    helmType: 'flux' | 'plain';
    helmNamespace: string | null;
    helmName: string | null;
}

export interface IEnvironmentResponse {
    id: number;
    appId: number;
    name: string;
    branch: string;
    iacId: number;
    iacName: string;
    iacPath: string;
    iacBranch: string | null;
    clusterId: number;
    clusterName: string;
    helmType: 'flux' | 'plain';
    helmNamespace: string | null;
    helmName: string | null;
    canManage: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export function toEnvironmentResponse(
    environment: AppEnvironmentEntity,
    iacs: Map<number, IacEntity>,
    clusters: Map<number, ClusterEntity>,
    canManage: boolean
): IEnvironmentResponse {
    return {
        id: environment.id,
        appId: environment.appId,
        name: environment.name,
        branch: environment.branch,
        iacId: environment.iacId,
        iacName: iacs.get(environment.iacId)?.name ?? 'unknown',
        iacPath: environment.iacPath,
        iacBranch: environment.iacBranch,
        clusterId: environment.clusterId,
        clusterName: clusters.get(environment.clusterId)?.name ?? 'unknown',
        helmType: environment.helmType,
        helmNamespace: environment.helmNamespace,
        helmName: environment.helmName,
        canManage,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt
    };
}

@ApiController('/api/apps/:appId/environments')
@http.middleware(UserAuthMiddleware)
export class EnvironmentsController {
    constructor(
        private db: Db,
        private appAccess: AppAccessService
    ) {}

    @http.GET()
    async index(appId: number, user: UserEntity): Promise<IEnvironmentResponse[]> {
        const { environments, iacs } = await this.appAccess.loadApp(user, appId);
        const clusters = await this.appAccess.clustersFor(environments);
        const manageByEnv = await this.appAccess.perEnvironmentManage(user, environments, iacs);
        return environments.map(env => toEnvironmentResponse(env, iacs, clusters, manageByEnv.get(env.id) ?? false));
    }

    @http.POST()
    async create(appId: number, body: HttpBody<IEnvironmentInput>, user: UserEntity): Promise<IEnvironmentResponse> {
        const { roles } = await this.appAccess.loadApp(user, appId);

        // Reshaping an app requires managing the app itself — otherwise a reader on this app who
        // happens to maintain some *other* IaC repo could graft an environment onto it, which
        // both strips the real owners' manage rights (canManage is all-environments) and can
        // break the app's deploys via a duplicate branch. Managing the target repo is necessary
        // but not sufficient.
        this.appAccess.requireManage(roles, 'app');
        await this.appAccess.requireIacRole(user, body.iacId, 'manage');
        await this.appAccess.assertClusterExists(body.clusterId);

        const input = this.appAccess.normalizeEnvironmentInput(body);
        await this.assertNameIsFree(appId, input.branch, input.name, null);

        const environment = await createPersistedEntity(AppEnvironmentEntity, {
            appId,
            ...input,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return this.toResponse(environment, true);
    }

    @http.PUT(':id')
    async update(appId: number, id: number, body: HttpBody<IEnvironmentInput>, user: UserEntity): Promise<IEnvironmentResponse> {
        await this.appAccess.loadApp(user, appId);
        const environment = await this.load(appId, id);

        // Changing where an environment deploys needs manage on both the repo it is leaving
        // and the one it is joining — otherwise it would be an escape hatch out of a repo you
        // do not control into one you do.
        const currentIac = await this.appAccess.iacFor(environment);
        await this.appAccess.requireIacRole(user, currentIac.id, 'manage');
        await this.appAccess.requireIacRole(user, body.iacId, 'manage');
        await this.appAccess.assertClusterExists(body.clusterId);

        const input = this.appAccess.normalizeEnvironmentInput(body);
        await this.assertNameIsFree(appId, input.branch, input.name, id);

        Object.assign(environment, input);
        environment.updatedAt = new Date();
        await persistEntity(environment);

        return this.toResponse(environment, true);
    }

    @http.DELETE(':id')
    async destroy(appId: number, id: number, user: UserEntity): Promise<{ deleted: true }> {
        const { environments } = await this.appAccess.loadApp(user, appId);
        const environment = await this.load(appId, id);

        const iac = await this.appAccess.iacFor(environment);
        await this.appAccess.requireIacRole(user, iac.id, 'manage');

        // The last environment is what makes the app visible at all; removing it would strand
        // the app where nobody could see or delete it.
        if (environments.length <= 1) {
            throw new HttpBadRequestError('Cannot delete the only environment of an app; delete the app instead');
        }

        await this.db.transaction(async session => {
            await session.query(DeploymentEntity).filter({ appEnvironmentId: id }).deleteMany();
            await session.query(AppEnvironmentEntity).filter({ id }).deleteMany();
        });

        return { deleted: true };
    }

    private async load(appId: number, id: number): Promise<AppEnvironmentEntity> {
        const environment = await AppEnvironmentEntity.query().filter({ id, appId }).findOneOrUndefined();
        if (!environment) throw new HttpNotFoundError(`Environment ${id} not found`);
        return environment;
    }

    /** Mirrors the unique index on (appId, branch, name) with a 400 instead of a 500. */
    private async assertNameIsFree(appId: number, branch: string, name: string, excludeId: number | null): Promise<void> {
        const existing = await AppEnvironmentEntity.query().filter({ appId, branch, name }).findOneOrUndefined();
        if (existing && existing.id !== excludeId) {
            throw new HttpBadRequestError(`An environment named "${name}" already exists for branch "${branch}"`);
        }
    }

    private async toResponse(environment: AppEnvironmentEntity, canManage: boolean): Promise<IEnvironmentResponse> {
        const iacs = await this.appAccess.iacsFor([environment]);
        const clusters = await this.appAccess.clustersFor([environment]);
        return toEnvironmentResponse(environment, iacs, clusters, canManage);
    }
}
