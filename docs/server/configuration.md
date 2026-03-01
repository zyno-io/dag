# Server Configuration

## Environment Variables

### Application

| Variable                      | Type     | Default    | Description                                                              |
| ----------------------------- | -------- | ---------- | ------------------------------------------------------------------------ |
| `APP_ENV`                     | `string` | —          | Application environment (e.g. `production`)                              |
| `PORT`                        | `number` | `3000`     | HTTP server port                                                         |
| `DATA_DIR`                    | `string` | `/tmp/dag` | Directory for staged charts and cloned IAC repos (rarely needs changing) |
| `DEPLOY_MONITOR_TIMEOUT_SECS` | `number` | `300`      | Timeout (seconds) for monitoring Kubernetes deployments                  |

### PostgreSQL

| Variable             | Type      | Default  | Description       |
| -------------------- | --------- | -------- | ----------------- |
| `PG_HOST`            | `string`  | —        | Database host     |
| `PG_PORT`            | `number`  | `5432`   | Database port     |
| `PG_USER`            | `string`  | —        | Database user     |
| `PG_PASSWORD_SECRET` | `string`  | —        | Database password |
| `PG_DATABASE`        | `string`  | —        | Database name     |
| `PG_SCHEMA`          | `string`  | `public` | Database schema   |
| `PG_SSL`             | `boolean` | `false`  | Enable SSL        |

### Redis

| Variable            | Type     | Default   | Description                                    |
| ------------------- | -------- | --------- | ---------------------------------------------- |
| `REDIS_HOST`        | `string` | —         | Redis host                                     |
| `REDIS_PORT`        | `number` | `6379`    | Redis port                                     |
| `REDIS_PREFIX`      | `string` | —         | Key prefix                                     |
| `BULL_REDIS_HOST`   | `string` | —         | BullMQ Redis host (falls back to `REDIS_HOST`) |
| `BULL_REDIS_PORT`   | `number` | —         | BullMQ Redis port (falls back to `REDIS_PORT`) |
| `BULL_REDIS_PREFIX` | `string` | —         | BullMQ key prefix                              |
| `BULL_QUEUE`        | `string` | `default` | BullMQ queue name                              |

### Distributed Locking

| Variable     | Type                 | Default | Description                                                               |
| ------------ | -------------------- | ------- | ------------------------------------------------------------------------- |
| `MUTEX_MODE` | `'local' \| 'redis'` | `local` | Mutex implementation — use `redis` when running multiple server instances |

### Observability

| Variable                      | Type     | Default | Description                      |
| ----------------------------- | -------- | ------- | -------------------------------- |
| `SENTRY_DSN`                  | `string` | —       | Sentry error tracking DSN        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `string` | —       | OpenTelemetry collector endpoint |

## Database Entities

DAG uses four main entities to configure the deployment pipeline:

### Apps

Register each application repository that will deploy through DAG.

| Field         | Type                   | Description                                        |
| ------------- | ---------------------- | -------------------------------------------------- |
| `gitProvider` | `'gitlab' \| 'github'` | Git hosting provider                               |
| `repoUrl`     | `string`               | Repository URL (e.g. `https://gitlab.com/org/app`) |

### IAC Repositories

Configure the Infrastructure-as-Code repositories where charts will be pushed.

| Field         | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `name`        | `string` | Human-readable name                                    |
| `repoUrl`     | `string` | Git repository URL                                     |
| `accessToken` | `string` | Git access token (used for OAuth2 push authentication) |

### Clusters

Register Kubernetes clusters that DAG will monitor for deployment status.

| Field                 | Type             | Description                         |
| --------------------- | ---------------- | ----------------------------------- |
| `name`                | `string`         | Cluster name                        |
| `apiUrl`              | `string`         | Kubernetes API server URL           |
| `serviceAccountToken` | `string`         | Service account bearer token        |
| `caCert`              | `string \| null` | CA certificate for TLS verification |

### App Environments

Map an app's branch to a specific IAC repo path, cluster, and Helm configuration.

| Field           | Type                | Description                             |
| --------------- | ------------------- | --------------------------------------- |
| `appId`         | `number`            | Foreign key to App                      |
| `branch`        | `string`            | Git branch name (e.g. `main`)           |
| `iacId`         | `number`            | Foreign key to IAC Repository           |
| `iacPath`       | `string`            | Path within IAC repo to place the chart |
| `clusterId`     | `number`            | Foreign key to Cluster                  |
| `helmType`      | `'flux' \| 'plain'` | Helm deployment type                    |
| `helmNamespace` | `string \| null`    | Kubernetes namespace                    |
| `helmName`      | `string \| null`    | Helm release name                       |
| `iacBranch`     | `string \| null`    | IAC repo branch (null = default branch) |
