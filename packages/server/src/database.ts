import { createPostgresDatabase, PostgresDatabaseSession } from '@zyno-io/dk-server-foundation';

import { AppEntity } from './entities/app.entity';
import { AppEnvironmentEntity } from './entities/app-environment.entity';
import { ClusterEntity } from './entities/cluster.entity';
import { DeploymentEntity } from './entities/deployment.entity';
import { IacEntity } from './entities/iac.entity';

export class DB extends createPostgresDatabase({}, [AppEntity, AppEnvironmentEntity, ClusterEntity, DeploymentEntity, IacEntity]) {}

export type DBSession = PostgresDatabaseSession;
