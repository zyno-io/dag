import { createPostgresDatabase } from '@zyno-io/ts-server-foundation';

import { AppEnvironmentTargetEntity } from './entities/app-environment-target.entity';
import { AppEnvironmentEntity } from './entities/app-environment.entity';
import { AppEntity } from './entities/app.entity';
import { ClusterEntity } from './entities/cluster.entity';
import { DeploymentTargetEntity } from './entities/deployment-target.entity';
import { DeploymentEntity } from './entities/deployment.entity';
import { IacEntity } from './entities/iac.entity';
import { UserEntity } from './entities/user.entity';

export class Db extends createPostgresDatabase({}, [
    AppEntity,
    AppEnvironmentEntity,
    AppEnvironmentTargetEntity,
    ClusterEntity,
    DeploymentEntity,
    DeploymentTargetEntity,
    IacEntity,
    UserEntity
]) {}
