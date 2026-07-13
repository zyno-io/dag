import type { DeploymentStatus } from '@zyno-io/dag-shared';

import { http, HttpNotFoundError, HttpQueries } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
import { DeploymentEntity } from '../entities/deployment.entity';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { AppAccessService } from '../services/app-access.service';
import { buildCommitUrl, buildJobUrl } from '../services/deployment.service';

interface IDeploymentResponse {
    id: string;
    appId: number;
    appName: string;
    environmentId: number;
    environmentName: string;
    branch: string;
    version: string;
    status: DeploymentStatus;
    statusMessage: string | null;
    ciJobId: string;
    /** Link to the CI job that triggered this deployment. */
    jobUrl: string;
    /** Link to the commit this deployment made in the IaC repo. */
    commitUrl: string | null;
    /** The app commit that was deployed. */
    sourceCommitSha: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface IDeploymentListQuery {
    appId?: number;
    environmentId?: number;
    status?: DeploymentStatus;
    limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read-only. Deployments are triggered by CI, never by a human here — nothing in this
 * controller mutates one.
 */
@ApiController('/api/deployments')
@http.middleware(UserAuthMiddleware)
export class DeploymentsController {
    constructor(private appAccess: AppAccessService) {}

    @http.GET()
    async index(query: HttpQueries<IDeploymentListQuery>, user: UserEntity): Promise<IDeploymentResponse[]> {
        // Resolve which environments the user can see first, then constrain the deployment
        // query to those. Source-repo readers see all of their app's environments; IaC-only
        // readers see only environments backed by repositories they can read.
        const visibleEnvironments = await this.visibleEnvironments(user, query.appId, query.environmentId);
        if (!visibleEnvironments.length) return [];

        const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

        let deploymentQuery = DeploymentEntity.query().filter({
            appEnvironmentId: { $in: visibleEnvironments.map(env => env.id) }
        });
        if (query.status) {
            deploymentQuery = deploymentQuery.filter({ status: query.status });
        }

        const deployments = await deploymentQuery.orderBy('createdAt', 'desc').limit(limit).find();
        return this.enrich(deployments, visibleEnvironments);
    }

    @http.GET(':id')
    async show(id: string, user: UserEntity): Promise<IDeploymentResponse> {
        const deployment = await DeploymentEntity.query().filter({ id }).findOneOrUndefined();
        if (!deployment) throw new HttpNotFoundError(`Deployment ${id} not found`);

        const environment = await AppEnvironmentEntity.query().filter({ id: deployment.appEnvironmentId }).findOneOrUndefined();
        if (!environment) throw new HttpNotFoundError(`Deployment ${id} not found`);

        const app = await AppEntity.query().filter({ id: environment.appId }).findOneOrUndefined();
        if (!app) throw new HttpNotFoundError(`Deployment ${id} not found`);

        const iacs = await this.appAccess.iacsFor([environment]);
        const roles = await this.appAccess.rolesForApp(user, app, [environment], iacs);
        // 404 rather than 403 when unreadable, so this can't be used to probe whether a given
        // deployment id exists — matching how apps hide themselves.
        if (!roles.visibleEnvironmentIds.has(environment.id)) {
            throw new HttpNotFoundError(`Deployment ${id} not found`);
        }

        const [enriched] = await this.enrich([deployment], [environment]);
        return enriched;
    }

    private async visibleEnvironments(user: UserEntity, appId?: number, environmentId?: number): Promise<AppEnvironmentEntity[]> {
        let query = AppEnvironmentEntity.query();
        if (appId) query = query.filter({ appId });
        if (environmentId) query = query.filter({ id: environmentId });

        const environments = await query.find();
        if (!environments.length) return [];

        const iacs = await this.appAccess.iacsFor(environments);
        const appIds = [...new Set(environments.map(environment => environment.appId))];
        const apps = await AppEntity.query()
            .filter({ id: { $in: appIds } })
            .find();

        const visibleIds = new Set<number>();
        await Promise.all(
            apps.map(async app => {
                const appEnvironments = environments.filter(environment => environment.appId === app.id);
                const roles = await this.appAccess.rolesForApp(user, app, appEnvironments, iacs);
                for (const id of roles.visibleEnvironmentIds) visibleIds.add(id);
            })
        );

        return environments.filter(environment => visibleIds.has(environment.id));
    }

    private async enrich(deployments: DeploymentEntity[], environments: AppEnvironmentEntity[]): Promise<IDeploymentResponse[]> {
        const environmentsById = new Map(environments.map(env => [env.id, env]));

        const appIds = [...new Set(environments.map(env => env.appId))];
        const apps = appIds.length
            ? await AppEntity.query()
                  .filter({ id: { $in: appIds } })
                  .find()
            : [];
        const appsById = new Map(apps.map(app => [app.id, app]));

        const iacIds = [...new Set(environments.map(env => env.iacId))];
        const iacs = iacIds.length
            ? await IacEntity.query()
                  .filter({ id: { $in: iacIds } })
                  .find()
            : [];
        const iacsById = new Map(iacs.map(iac => [iac.id, iac]));

        return deployments.map(deployment => {
            const environment = environmentsById.get(deployment.appEnvironmentId)!;
            const app = appsById.get(environment.appId);
            const iac = iacsById.get(environment.iacId);

            return {
                id: deployment.id,
                appId: environment.appId,
                appName: app?.name ?? 'unknown',
                environmentId: environment.id,
                environmentName: environment.name,
                branch: environment.branch,
                version: deployment.version,
                status: deployment.status,
                statusMessage: deployment.statusMessage,
                ciJobId: deployment.ciJobId,
                jobUrl: app ? buildJobUrl(app.gitProvider, app.repoUrl, deployment.ciJobId) : '',
                commitUrl: iac && deployment.commitSha ? (buildCommitUrl(iac.repoUrl, deployment.commitSha) ?? null) : null,
                sourceCommitSha: deployment.sourceCommitSha,
                createdAt: deployment.createdAt,
                updatedAt: deployment.updatedAt
            };
        });
    }
}
