# Creating Apps

Apps are configured directly in the database. Each app maps a source repository to one or more deployment environments.

## 1. Register the App

Insert a row into the `apps` table for each application repository:

| Field         | Type                   | Description                                        |
| ------------- | ---------------------- | -------------------------------------------------- |
| `gitProvider` | `'gitlab' \| 'github'` | Git hosting provider                               |
| `repoUrl`     | `string`               | Repository URL (e.g. `https://gitlab.com/org/app`) |

```sql
INSERT INTO apps (git_provider, repo_url)
VALUES ('gitlab', 'https://gitlab.com/org/my-app');
```

## 2. Add an IAC Repository

If you haven't already, register the IAC repository where charts will be pushed:

```sql
INSERT INTO iacs (name, repo_url, access_token)
VALUES ('prod-iac', 'https://gitlab.com/org/iac-repo.git', 'your-access-token');
```

The access token is encrypted at rest. See [IAC Repositories](./iac-repos.md) for details on token setup.

## 3. Add a Cluster

If you haven't already, register the Kubernetes cluster DAG will monitor:

```sql
INSERT INTO clusters (name, api_url, service_account_token, ca_cert)
VALUES ('prod-1', 'https://k8s.example.com:6443', 'your-sa-token', 'your-ca-cert');
```

See [Clusters](./clusters.md) for service account and CA certificate setup.

## 4. Create an App Environment

Map a branch to an IAC repo path, cluster, and Helm configuration:

| Field           | Type                | Description                             |
| --------------- | ------------------- | --------------------------------------- |
| `appId`         | `number`            | Foreign key to App                      |
| `branch`        | `string`            | Git branch that triggers deployment     |
| `iacId`         | `number`            | Foreign key to IAC Repository           |
| `iacPath`       | `string`            | Path within IAC repo to place the chart |
| `clusterId`     | `number`            | Foreign key to Cluster                  |
| `helmType`      | `'flux' \| 'plain'` | Helm deployment type                    |
| `helmNamespace` | `string \| null`    | Kubernetes namespace                    |
| `helmName`      | `string \| null`    | Helm release name                       |
| `iacBranch`     | `string \| null`    | IAC repo branch (null = default branch) |

```sql
INSERT INTO apps_environments
  (app_id, branch, iac_id, iac_path, cluster_id, helm_type, helm_namespace, helm_name)
VALUES
  (1, 'main', 1, 'clusters/production/my-app', 1, 'flux', 'default', 'my-app');
```

## Multiple Environments

You can map multiple branches to different environments. For example, deploy `develop` to staging and `main` to production:

```sql
-- Staging
INSERT INTO apps_environments
  (app_id, branch, iac_id, iac_path, cluster_id, helm_type, helm_namespace, helm_name)
VALUES
  (1, 'develop', 1, 'clusters/staging/my-app', 1, 'flux', 'staging', 'my-app');

-- Production
INSERT INTO apps_environments
  (app_id, branch, iac_id, iac_path, cluster_id, helm_type, helm_namespace, helm_name)
VALUES
  (1, 'main', 1, 'clusters/production/my-app', 1, 'flux', 'production', 'my-app');
```
