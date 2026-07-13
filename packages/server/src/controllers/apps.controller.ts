import { createPersistedEntity, http, HttpBody, persistEntity } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { Db } from '../database';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
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

        const clusters = await this.appAccess.clustersFor(visibleEnvironments);
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
            environments: visibleEnvironments.map(env => toEnvironmentResponse(env, iacs, clusters, manageByEnv.get(env.id) ?? false))
        };
    }

    @http.POST()
    async create(body: HttpBody<IAppCreateInput>, user: UserEntity): Promise<IAppDetailResponse> {
        // You may only introduce an app into an IaC repo you could already change by hand.
        await this.appAccess.requireIacRole(user, body.environment.iacId, 'manage');
        await this.appAccess.assertClusterExists(body.environment.clusterId);

        const repoUrl = normalizeRepoUrl(body.repoUrl);

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

            await createPersistedEntity(
                AppEnvironmentEntity,
                {
                    appId: app.id,
                    ...this.appAccess.normalizeEnvironmentInput(body.environment),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                session
            );

            return app.id;
        });

        return this.show(appId, user);
    }

    @http.PUT(':id')
    async update(id: number, body: HttpBody<IAppUpdateInput>, user: UserEntity): Promise<IAppDetailResponse> {
        const { app, roles } = await this.appAccess.loadApp(user, id);
        this.appAccess.requireManage(roles, 'app');

        app.name = body.name.trim();
        app.gitProvider = body.gitProvider;
        app.repoUrl = normalizeRepoUrl(body.repoUrl);
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
                await session
                    .query(DeploymentEntity)
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
}
