import { createPersistedEntity, http, HttpBadRequestError, HttpBody, HttpNotFoundError, persistEntity } from '@zyno-io/ts-server-foundation';

import { UserAuthMiddleware } from '../accessories/auth-middleware.accessory';
import { ApiController } from '../accessories/controller.accessory';
import { AppEnvironmentEntity } from '../entities/app-environment.entity';
import { ClusterEntity } from '../entities/cluster.entity';
import { UserEntity } from '../entities/user.entity';
import { encryptValue } from '../helpers/crypto';
import { IacAuthService } from '../services/iac-auth.service';

/** Note the absence of serviceAccountToken: it is write-only and never leaves the server. */
interface IClusterResponse {
    id: number;
    name: string;
    apiUrl: string;
    hasCaCert: boolean;
    /** Environments currently deploying to this cluster; a cluster in use cannot be deleted. */
    environmentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

interface IClusterCreateInput {
    name: string;
    apiUrl: string;
    serviceAccountToken: string;
    caCert: string | null;
}

interface IClusterUpdateInput {
    name: string;
    apiUrl: string;
    /** Omitted or empty leaves the stored token untouched, so the UI never has to round-trip it. */
    serviceAccountToken?: string;
    /**
     * Tri-state, so a rename can't silently wipe a stored CA cert (which the response never
     * returns): omitted → keep as-is; null → explicitly clear; a string → replace.
     */
    caCert?: string | null;
}

/**
 * Clusters hold Kubernetes credentials and are shared across apps, so they are not scoped to
 * one IaC repo. The gate is `manage` on at least one IaC repo — the people who provision the
 * infrastructure repos are the ones who own cluster access.
 */
@ApiController('/api/clusters')
@http.middleware(UserAuthMiddleware)
export class ClustersController {
    constructor(private iacAuth: IacAuthService) {}

    @http.GET()
    async index(user: UserEntity): Promise<IClusterResponse[]> {
        await this.iacAuth.requireOperator(user);

        const clusters = await ClusterEntity.query().orderBy('name').find();
        const environments = await AppEnvironmentEntity.query().find();

        return clusters.map(cluster => this.toResponse(cluster, environments));
    }

    @http.POST()
    async create(body: HttpBody<IClusterCreateInput>, user: UserEntity): Promise<IClusterResponse> {
        await this.iacAuth.requireOperator(user);

        if (!body.serviceAccountToken?.trim()) {
            throw new HttpBadRequestError('serviceAccountToken is required');
        }

        const cluster = await createPersistedEntity(ClusterEntity, {
            name: body.name.trim(),
            apiUrl: body.apiUrl.trim(),
            serviceAccountToken: encryptValue(body.serviceAccountToken.trim()),
            caCert: body.caCert?.trim() || null,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return this.toResponse(cluster, []);
    }

    @http.PUT(':id')
    async update(id: number, body: HttpBody<IClusterUpdateInput>, user: UserEntity): Promise<IClusterResponse> {
        await this.iacAuth.requireOperator(user);

        const cluster = await this.load(id);

        cluster.name = body.name.trim();
        cluster.apiUrl = body.apiUrl.trim();

        // Only replace the token when a new one was actually supplied.
        if (body.serviceAccountToken?.trim()) {
            cluster.serviceAccountToken = encryptValue(body.serviceAccountToken.trim());
        }

        // undefined → keep; null → clear; string → replace. Prevents a rename from wiping the cert.
        if (body.caCert !== undefined) {
            cluster.caCert = body.caCert?.trim() || null;
        }

        cluster.updatedAt = new Date();
        await persistEntity(cluster);

        const environments = await AppEnvironmentEntity.query().find();
        return this.toResponse(cluster, environments);
    }

    @http.DELETE(':id')
    async destroy(id: number, user: UserEntity): Promise<{ deleted: true }> {
        await this.iacAuth.requireOperator(user);

        const cluster = await this.load(id);

        // Nothing in the schema stops this, and a dangling clusterId would only fail at deploy time.
        const inUse = await AppEnvironmentEntity.query().filter({ clusterId: cluster.id }).count();
        if (inUse > 0) {
            throw new HttpBadRequestError(`Cluster is still used by ${inUse} environment(s)`);
        }

        await ClusterEntity.query().filter({ id: cluster.id }).deleteMany();
        return { deleted: true };
    }

    private async load(id: number): Promise<ClusterEntity> {
        const cluster = await ClusterEntity.query().filter({ id }).findOneOrUndefined();
        if (!cluster) throw new HttpNotFoundError(`Cluster ${id} not found`);
        return cluster;
    }

    private toResponse(cluster: ClusterEntity, environments: AppEnvironmentEntity[]): IClusterResponse {
        return {
            id: cluster.id,
            name: cluster.name,
            apiUrl: cluster.apiUrl,
            hasCaCert: !!cluster.caCert,
            environmentCount: environments.filter(env => env.clusterId === cluster.id).length,
            createdAt: cluster.createdAt,
            updatedAt: cluster.updatedAt
        };
    }
}
