# Server Configuration

## Environment Variables

### Application

| Variable                      | Type     | Default    | Description                                                              |
| ----------------------------- | -------- | ---------- | ------------------------------------------------------------------------ |
| `APP_ENV`                     | `string` | —          | Application environment (e.g. `production`)                              |
| `PORT`                        | `number` | `3000`     | HTTP server port                                                         |
| `DATA_DIR`                    | `string` | `/tmp/dag` | Directory for staged charts and cloned IAC repos (rarely needs changing) |
| `DEPLOY_MONITOR_TIMEOUT_SECS` | `number` | `300`      | Default rollout budget (seconds) for targets without an override         |

### PostgreSQL

| Variable                     | Type      | Default  | Description                      |
| ---------------------------- | --------- | -------- | -------------------------------- |
| `PG_HOST`                    | `string`  | —        | Database host                    |
| `PG_PORT`                    | `number`  | `5432`   | Database port                    |
| `PG_USER`                    | `string`  | —        | Database user                    |
| `PG_PASSWORD_SECRET`         | `string`  | —        | Database password                |
| `PG_DATABASE`                | `string`  | —        | Database name                    |
| `PG_SCHEMA`                  | `string`  | `public` | Database schema                  |
| `PG_SSL`                     | `boolean` | `false`  | Enable SSL                       |
| `PG_SSL_REJECT_UNAUTHORIZED` | `boolean` | `true`   | Reject unauthorized certificates |

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

| Field         | Type     | Description                                                |
| ------------- | -------- | ---------------------------------------------------------- |
| `name`        | `string` | Human-readable name                                        |
| `repoUrl`     | `string` | Git repository URL                                         |
| `accessToken` | `string` | Git access token (used for HTTP Basic push authentication) |

### Clusters

Register Kubernetes clusters that DAG will monitor for deployment status.

| Field                 | Type             | Description                         |
| --------------------- | ---------------- | ----------------------------------- |
| `name`                | `string`         | Cluster name                        |
| `apiUrl`              | `string`         | Kubernetes API server URL           |
| `serviceAccountToken` | `string`         | Service account bearer token        |
| `caCert`              | `string \| null` | CA certificate for TLS verification |

### App Environments

Map an app's branch and environment name to a specific IaC repo path and one or more Kubernetes deployment targets.

| Field       | Type             | Description                             |
| ----------- | ---------------- | --------------------------------------- |
| `appId`     | `number`         | Foreign key to App                      |
| `branch`    | `string`         | Git branch name (e.g. `main`)           |
| `name`      | `string`         | Target environment name (e.g. `prod`)   |
| `iacId`     | `number`         | Foreign key to IAC Repository           |
| `iacPath`   | `string`         | Path within IAC repo to place the chart |
| `iacBranch` | `string \| null` | IAC repo branch (null = default branch) |

Each environment has a non-empty `targets` list. A target contains `clusterId`, `helmType`, `helmNamespace` (default `default`), and `helmName` (default chart basename). DAG pushes the chart once to the environment's IaC path, then monitors every target concurrently. A deployment succeeds only when every target reports a successful Helm install or HelmRelease reconciliation.

### Target Rollout Budgets

Set `monitorTimeoutSecs` on each environment target through the environment editor or the environment create/update API's `targets` array. It must be a whole number from 1 through 2147483647 seconds. Null or omitted uses `DEPLOY_MONITOR_TIMEOUT_SECS` (default 300 seconds). This setting remains managed by the environment's IaC repository owners.

The target summary and editor show the actual configured server timeout when a target has no override. Leaving the editor field blank keeps the target on that server setting.

At submission, DAG resolves each target's budget and persists it alongside the immutable Helm destination in the deployment target snapshot. Later target edits or server-default changes do not alter an in-flight deployment. Each monitor uses its own budget across both revision detection and rollout readiness, starting when that monitor begins polling after the chart is pushed. DAG waits for every target to finish before reporting the aggregate result.

Kubernetes polling requests are cancelled after 30 seconds, or sooner when the target's remaining budget expires. Transient request errors are retried within that same budget.

For an edge target whose HelmRelease allows eight hours, set `monitorTimeoutSecs` to `28800` or a larger budget that also allows time for Flux to detect the new revision. Other targets can retain shorter budgets. This controls DAG monitoring; it does not change the HelmRelease's own timeout.

The migration leaves existing environment targets on the server default. Historical deployment target snapshots are backfilled with the previous built-in 300-second budget; their original custom server setting was not recorded. New snapshots always store the resolved budget explicitly.
