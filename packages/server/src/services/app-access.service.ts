import { HttpAccessDeniedError, HttpNotFoundError } from '@zyno-io/ts-server-foundation';

import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { AppEntity } from '../entities/app.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { IacEntity } from '../entities/iac.entity';
import { UserEntity } from '../entities/user.entity';
import { GitLabProjectAuthService } from './gitlab-project-auth.service';
import { IacAuthService, IacRole } from './iac-auth.service';

export interface AppRoles {
    /** The user can see this app through its source repo or at least one environment's IaC repo. */
    canRead: boolean;
    /**
     * The user can rename or delete this app. An app spanning two IaC repos affects both, so
     * this requires `manage` on every one of them, not just any.
     */
    canManage: boolean;
    /** Source-repo readers may see every environment, including IaC repos they do not maintain. */
    sourceCanRead: boolean;
    /** Environment visibility after combining source-repo and per-IaC access. */
    visibleEnvironmentIds: Set<number>;
}

/**
 * Answers "what may this user do with this app", which is never a property of the app itself
 * — visibility comes from the source repo, while control comes from the IaC repos its
 * environments deploy into. IaC readers retain visibility for infrastructure operations.
 */
export class AppAccessService {
    constructor(
        private iacAuth: IacAuthService,
        private projectAuth: GitLabProjectAuthService
    ) {}

    /** Every IaC repo referenced by the given environments, by id. */
    async iacsFor(environments: AppEnvironmentEntity[]): Promise<Map<number, IacEntity>> {
        const ids = [...new Set(environments.map(env => env.iacId))];
        if (!ids.length) return new Map();

        const iacs = await IacEntity.query()
            .filter({ id: { $in: ids } })
            .find();
        return new Map(iacs.map(iac => [iac.id, iac]));
    }

    async rolesForApp(user: UserEntity, app: AppEntity, environments: AppEnvironmentEntity[], iacs: Map<number, IacEntity>): Promise<AppRoles> {
        // Reporter is the first standard GitLab role that can read a private repository.
        // Public visibility alone does not count: getProjectAccessLevel returns `none` without
        // an explicit project/group grant.
        const sourceAccess = app.gitProvider === 'gitlab' ? this.projectAuth.hasAccess(user, app.repoUrl, 'reporter') : Promise.resolve(false);

        const accessByIacId = new Map<number, { read: boolean; manage: boolean }>();
        const iacAccess = Promise.all(
            [...new Set(environments.map(env => env.iacId))].map(async iacId => {
                const iac = iacs.get(iacId);
                accessByIacId.set(
                    iacId,
                    iac
                        ? {
                              read: await this.iacAuth.hasRole(user, iac, 'read'),
                              manage: await this.iacAuth.hasRole(user, iac, 'manage')
                          }
                        : { read: false, manage: false }
                );
            })
        );
        const [sourceCanRead] = await Promise.all([sourceAccess, iacAccess]);

        const visibleEnvironmentIds = new Set(environments.filter(env => sourceCanRead || accessByIacId.get(env.iacId)?.read).map(env => env.id));

        return {
            canRead: sourceCanRead || visibleEnvironmentIds.size > 0,
            canManage: environments.length > 0 && [...accessByIacId.values()].every(access => access.manage),
            sourceCanRead,
            visibleEnvironmentIds
        };
    }

    /** The app, its environments and the user's roles — or 404 if they cannot even see it. */
    async loadApp(user: UserEntity, appId: number) {
        const app = await AppEntity.query().filter({ id: appId }).findOneOrUndefined();
        if (!app) throw new HttpNotFoundError(`App ${appId} not found`);

        const environments = await AppEnvironmentEntity.query().filter({ appId }).orderBy('name').find();
        const iacs = await this.iacsFor(environments);
        const roles = await this.rolesForApp(user, app, environments, iacs);

        // Don't distinguish "does not exist" from "not yours" — that would leak which repos exist.
        if (!roles.canRead) throw new HttpNotFoundError(`App ${appId} not found`);

        const visibleEnvironments = environments.filter(environment => roles.visibleEnvironmentIds.has(environment.id));
        return { app, environments, visibleEnvironments, iacs, roles };
    }

    requireManage(roles: AppRoles, what: string): void {
        if (!roles.canManage) {
            throw new HttpAccessDeniedError(`Requires maintainer access to every IaC repository this ${what} deploys into`);
        }
    }

    /** The IaC repo an environment deploys into, for a direct permission check against it. */
    async iacFor(environment: AppEnvironmentEntity): Promise<IacEntity> {
        const iac = await IacEntity.query().filter({ id: environment.iacId }).findOneOrUndefined();
        if (!iac) throw new HttpNotFoundError(`IaC repository ${environment.iacId} not found`);
        return iac;
    }

    async requireIacRole(user: UserEntity, iacId: number, role: IacRole): Promise<IacEntity> {
        const iac = await IacEntity.query().filter({ id: iacId }).findOneOrUndefined();
        if (!iac) throw new HttpNotFoundError(`IaC repository ${iacId} not found`);
        await this.iacAuth.requireRole(user, iac, role);
        return iac;
    }

    /**
     * Whether the user can manage each environment individually — i.e. holds manage on that
     * environment's own IaC repo. The env edit/delete endpoints authorize per-repo, so the UI's
     * per-environment controls must reflect that, not the stricter app-wide canManage.
     */
    async perEnvironmentManage(user: UserEntity, environments: AppEnvironmentEntity[], iacs: Map<number, IacEntity>): Promise<Map<number, boolean>> {
        const entries = await Promise.all(
            environments.map(async env => {
                const iac = iacs.get(env.iacId);
                const canManage = iac ? await this.iacAuth.hasRole(user, iac, 'manage') : false;
                return [env.id, canManage] as const;
            })
        );
        return new Map(entries);
    }

    /** Every cluster referenced by the given environments, by id. */
    async clustersFor(environments: AppEnvironmentEntity[]): Promise<Map<number, ClusterEntity>> {
        const ids = [...new Set(environments.map(env => env.clusterId))];
        if (!ids.length) return new Map();

        const clusters = await ClusterEntity.query()
            .filter({ id: { $in: ids } })
            .find();
        return new Map(clusters.map(cluster => [cluster.id, cluster]));
    }

    /**
     * Clusters are referenced by id but there are no foreign keys, so a bad id would otherwise
     * only surface at deploy time as a 500.
     */
    async assertClusterExists(clusterId: number): Promise<ClusterEntity> {
        const cluster = await ClusterEntity.query().filter({ id: clusterId }).findOneOrUndefined();
        if (!cluster) throw new HttpNotFoundError(`Cluster ${clusterId} not found`);
        return cluster;
    }

    normalizeEnvironmentInput(input: EnvironmentInput): EnvironmentInput {
        const trimmedOrNull = (value: string | null) => {
            const trimmed = value?.trim();
            return trimmed ? trimmed : null;
        };

        return {
            name: input.name.trim(),
            branch: input.branch.trim(),
            iacId: input.iacId,
            // A leading slash would make path.resolve() escape the repo root.
            iacPath: input.iacPath.trim().replace(/^\/+/, '').replace(/\/+$/, ''),
            iacBranch: trimmedOrNull(input.iacBranch),
            clusterId: input.clusterId,
            helmType: input.helmType,
            helmNamespace: trimmedOrNull(input.helmNamespace),
            helmName: trimmedOrNull(input.helmName)
        };
    }
}

/** Structural copy of IEnvironmentInput, kept here to avoid a service→controller import cycle. */
export interface EnvironmentInput {
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
