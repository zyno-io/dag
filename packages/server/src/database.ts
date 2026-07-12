import { createPostgresDatabase } from '@zyno-io/ts-server-foundation';

import { AppEnvironmentEntity } from './entities/app-environment.entity';
import { AppEntity } from './entities/app.entity';
import { ClusterEntity } from './entities/cluster.entity';
import { DeploymentEntity } from './entities/deployment.entity';
import { IacEntity } from './entities/iac.entity';
import { UserEntity } from './entities/user.entity';

export class Db extends createPostgresDatabase({}, [AppEntity, AppEnvironmentEntity, ClusterEntity, DeploymentEntity, IacEntity, UserEntity]) {}
