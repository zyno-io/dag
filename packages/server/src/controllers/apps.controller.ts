import { createPersistedEntity, http, HttpBadRequestError, HttpBody, persistEntity } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { Db } from '../database';
import { AppEnvironmentTargetEntity } from '../entities/app-environment-target.entity';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
import { DeploymentTargetEntity } from '../entities/deployment-target.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { UserEntity } from '../entities/user.entity';
import { AppAccessService } from '../services/app-access.service';
import { IEnvironmentInput, IEnvironmentResponse, toEnvironmentResponse } from './environments.controller';

export interface IAppResponse {
    id: number;
    name: string;
    gitProvider: 'gitlab' | 'github';
    repoUrl: string;
    environmentCount: number;
    canManage: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAppDetailResponse extends IAppResponse {
    environments: IEnvironmentResponse[];
}

interface IAppCreateInput {
    name: string;
    gitProvider: 'gitlab' | 'github';
    repoUrl: string;
    /** An app needs an initial environment so its IaC control boundary is established up front. */
    environment: IEnvironmentInput;
}

interface IAppUpdateInput {
    name: string;
    gitProvider: 'gitlab' | 'github';
    repoUrl: string;
}

export function normalizeRepoUrl(repoUrl: string): string {
    return repoUrl.trim().replace(/\/+$/, '');
}

@ApiController('/api/apps')
@http.middleware(UserAuthMiddleware)
export class AppsController {
    constructor(
        private db: Db,
        private appAccess: AppAccessService
    ) {}

    @http.GET()
    async index(user: UserEntity): Promise<IAppResponse[]> {
        const apps = await AppEntity.query().orderBy('name').find();
        const environments = await AppEnvironmentEntity.query().find();
        const iacs = await this.appAccess.iacsFor(environments);

        const results = await Promise.all(
            apps.map(async app => {
                const appEnvironments = environments.filter(env => env.appId === app.id);
                const roles = await this.appAccess.rolesForApp(user, app, appEnvironments, iacs);
                if (!roles.canRead) return null;

                return {
                    id: app.id,
                    name: app.name,
                    gitProvider: app.gitProvider,
                    repoUrl: app.repoUrl,
                    environmentCount: roles.visibleEnvironmentIds.size,
                    canManage: roles.canManage,
                    createdAt: app.createdAt,
                    updatedAt: app.updatedAt
                };
            })
        );

        return results.filter(app => app !== null);
    }

    @http.GET(':id')
    async show(id: number, user: UserEntity): Promise<IAppDetailResponse> {
        const { app, visibleEnvironments, iacs, roles } = await this.appAccess.loadApp(user, id);

        const targetsByEnvironment = await this.appAccess.targetsFor(visibleEnvironments);
        const clusters = await this.appAccess.clustersForTargets([...targetsByEnvironment.values()].flat());
        const manageByEnv = await this.appAccess.perEnvironmentManage(user, visibleEnvironments, iacs);

        return {
            id: app.id,
            name: app.name,
            gitProvider: app.gitProvider,
            repoUrl: app.repoUrl,
            environmentCount: visibleEnvironments.length,
            canManage: roles.canManage,
            createdAt: app.createdAt,
            updatedAt: app.updatedAt,
            environments: visibleEnvironments.map(env =>
                toEnvironmentResponse(env, iacs, clusters, targetsByEnvironment, manageByEnv.get(env.id) ?? false)
            )
        };
    }

    @http.POST()
    async create(body: HttpBody<IAppCreateInput>, user: UserEntity): Promise<IAppDetailResponse> {
        // You may only introduce an app into an IaC repo you could already change by hand.
        await this.appAccess.requireIacRole(user, body.environment.iacId, 'manage');

        const repoUrl = normalizeRepoUrl(body.repoUrl);
        const environment = this.appAccess.normalizeEnvironmentInput(body.environment);
        await this.appAccess.assertTargetClustersExist(environment.targets);
        await this.assertRepoUrlIsFree(repoUrl, null);
        await this.appAccess.assertEnvironmentTargetsAreFree(environment, null);

        const appId = await this.db.transaction(async session => {
            const app = await createPersistedEntity(
                AppEntity,
                {
                    name: body.name.trim(),
                    gitProvider: body.gitProvider,
                    repoUrl,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                session
            );

            const createdEnvironment = await createPersistedEntity(
                AppEnvironmentEntity,
                {
                    appId: app.id,
                    ...this.toEnvironmentEntityInput(environment),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                session
            );

            const now = new Date();
            for (const target of environment.targets) {
                await createPersistedEntity(
                    AppEnvironmentTargetEntity,
                    {
                        appEnvironmentId: createdEnvironment.id,
                        ...target,
                        createdAt: now,
                        updatedAt: now
                    },
                    session
                );
            }

            return app.id;
        });

        return this.show(appId, user);
    }

    @http.PUT(':id')
    async update(id: number, body: HttpBody<IAppUpdateInput>, user: UserEntity): Promise<IAppDetailResponse> {
        const { app, roles } = await this.appAccess.loadApp(user, id);
        this.appAccess.requireManage(roles, 'app');

        const repoUrl = normalizeRepoUrl(body.repoUrl);
        await this.assertRepoUrlIsFree(repoUrl, id);

        app.name = body.name.trim();
        app.gitProvider = body.gitProvider;
        app.repoUrl = repoUrl;
        app.updatedAt = new Date();
        await persistEntity(app);

        return this.show(id, user);
    }

    @http.DELETE(':id')
    async destroy(id: number, user: UserEntity): Promise<{ deleted: true }> {
        const { app, environments, roles } = await this.appAccess.loadApp(user, id);
        this.appAccess.requireManage(roles, 'app');

        await this.db.transaction(async session => {
            const environmentIds = environments.map(env => env.id);
            if (environmentIds.length) {
                // Deployments hang off environments, and nothing enforces that in the schema.
                const deployments = await session
                    .query(DeploymentEntity)
                    .filter({ appEnvironmentId: { $in: environmentIds } })
                    .find();
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
                await session
                    .query(AppEnvironmentTargetEntity)
                    .filter({ appEnvironmentId: { $in: environmentIds } })
                    .deleteMany();
                await session
                    .query(AppEnvironmentEntity)
                    .filter({ id: { $in: environmentIds } })
                    .deleteMany();
            }
            await session.query(AppEntity).filter({ id: app.id }).deleteMany();
        });

        return { deleted: true };
    }

    /** Mirrors the unique repository index with a useful 400 response. */
    private async assertRepoUrlIsFree(repoUrl: string, excludeId: number | null): Promise<void> {
        const existing = await AppEntity.query().filter({ repoUrl }).findOneOrUndefined();
        if (existing && existing.id !== excludeId) {
            throw new HttpBadRequestError(`An app already uses repository "${repoUrl}"`);
        }
    }

    private toEnvironmentEntityInput(environment: ReturnType<AppAccessService['normalizeEnvironmentInput']>) {
        const { targets: _targets, ...entityInput } = environment;
        return entityInput;
    }
}
