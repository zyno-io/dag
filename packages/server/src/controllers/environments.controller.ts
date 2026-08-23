import { createPersistedEntity, DatabaseSession, http, HttpBadRequestError, HttpBody, HttpNotFoundError } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { Db } from '../database';
import { AppEnvironmentTargetEntity } from '../entities/app-environment-target.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { AppAccessService, EnvironmentInput, EnvironmentTarget, NormalizedEnvironmentInput } from '../services/app-access.service';

export type IEnvironmentInput = EnvironmentInput;

export interface IEnvironmentTargetResponse {
    id: number | null;
    clusterId: number;
    clusterName: string;
    helmType: 'flux' | 'plain';
    helmNamespace: string;
    helmName: string;
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
    /** @deprecated Use targets; these describe the first target for legacy API consumers. */
    clusterId: number;
    /** @deprecated Use targets; these describe the first target for legacy API consumers. */
    clusterName: string;
    /** @deprecated Use targets; these describe the first target for legacy API consumers. */
    helmType: 'flux' | 'plain';
    /** @deprecated Use targets; these describe the first target for legacy API consumers. */
    helmNamespace: string | null;
    /** @deprecated Use targets; these describe the first target for legacy API consumers. */
    helmName: string | null;
    targets: IEnvironmentTargetResponse[];
    canManage: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export function toEnvironmentResponse(
    environment: AppEnvironmentEntity,
    iacs: Map<number, IacEntity>,
    clusters: Map<number, ClusterEntity>,
    targetsByEnvironment: Map<number, EnvironmentTarget[]>,
    canManage: boolean
): IEnvironmentResponse {
    const targets = (targetsByEnvironment.get(environment.id) ?? []).map(target => ({
        id: target.id,
        clusterId: target.clusterId,
        clusterName: clusters.get(target.clusterId)?.name ?? 'unknown',
        helmType: target.helmType,
        helmNamespace: target.helmNamespace,
        helmName: target.helmName
    }));
    const primaryTarget = targets[0];

    return {
        id: environment.id,
        appId: environment.appId,
        name: environment.name,
        branch: environment.branch,
        iacId: environment.iacId,
        iacName: iacs.get(environment.iacId)?.name ?? 'unknown',
        iacPath: environment.iacPath,
        iacBranch: environment.iacBranch,
        clusterId: primaryTarget?.clusterId ?? environment.clusterId,
        clusterName: primaryTarget?.clusterName ?? clusters.get(environment.clusterId)?.name ?? 'unknown',
        helmType: primaryTarget?.helmType ?? environment.helmType,
        helmNamespace: primaryTarget?.helmNamespace ?? environment.helmNamespace,
        helmName: primaryTarget?.helmName ?? environment.helmName,
        targets,
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
        const { visibleEnvironments, iacs } = await this.appAccess.loadApp(user, appId);
        const targetsByEnvironment = await this.appAccess.targetsFor(visibleEnvironments);
        const clusters = await this.appAccess.clustersForTargets([...targetsByEnvironment.values()].flat());
        const manageByEnv = await this.appAccess.perEnvironmentManage(user, visibleEnvironments, iacs);
        return visibleEnvironments.map(env => toEnvironmentResponse(env, iacs, clusters, targetsByEnvironment, manageByEnv.get(env.id) ?? false));
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

        const input = this.appAccess.normalizeEnvironmentInput(body);
        await this.appAccess.assertTargetClustersExist(input.targets);
        await this.assertNameIsFree(appId, input.branch, input.name, null);
        await this.appAccess.assertEnvironmentTargetsAreFree(input, null);

        const environment = await this.db.transaction(async session => {
            const now = new Date();
            const created = await createPersistedEntity(
                AppEnvironmentEntity,
                {
                    appId,
                    ...this.toEnvironmentEntityInput(input),
                    createdAt: now,
                    updatedAt: now
                },
                session
            );
            await this.createTargets(created.id, input, now, session);
            return created;
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

        const input = this.appAccess.normalizeEnvironmentInput(body);
        await this.appAccess.assertTargetClustersExist(input.targets);
        await this.assertNameIsFree(appId, input.branch, input.name, id);
        await this.appAccess.assertEnvironmentTargetsAreFree(input, id);

        await this.db.transaction(async session => {
            const now = new Date();
            await session
                .query(AppEnvironmentEntity)
                .filter({ id: environment.id })
                .patchOne({ ...this.toEnvironmentEntityInput(input), updatedAt: now });
            await session.query(AppEnvironmentTargetEntity).filter({ appEnvironmentId: environment.id }).deleteMany();
            await this.createTargets(environment.id, input, now, session);
        });

        const updated = await this.load(appId, id);

        return this.toResponse(updated, true);
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
            const deployments = await session.query(DeploymentEntity).filter({ appEnvironmentId: id }).find();
            const deploymentIds = deployments.map(deployment => deployment.id);
            if (deploymentIds.length) {
                await session
                    .query(DeploymentTargetEntity)
                    .filter({ deploymentId: { $in: deploymentIds } })
                    .deleteMany();
                await session
                    .query(DeploymentEntity)
                    .filter({ id: { $in: deploymentIds } })
                    .deleteMany();
            }
            await session.query(AppEnvironmentTargetEntity).filter({ appEnvironmentId: id }).deleteMany();
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
        const targetsByEnvironment = await this.appAccess.targetsFor([environment]);
        const clusters = await this.appAccess.clustersForTargets([...targetsByEnvironment.values()].flat());
        return toEnvironmentResponse(environment, iacs, clusters, targetsByEnvironment, canManage);
    }

    private toEnvironmentEntityInput(input: NormalizedEnvironmentInput) {
        const { targets: _targets, ...entityInput } = input;
        return entityInput;
    }

    private async createTargets(environmentId: number, input: NormalizedEnvironmentInput, now: Date, session: DatabaseSession): Promise<void> {
        for (const target of input.targets) {
            await createPersistedEntity(
                AppEnvironmentTargetEntity,
                {
                    appEnvironmentId: environmentId,
                    ...target,
                    createdAt: now,
                    updatedAt: now
                },
                session
            );
        }
    }
}
