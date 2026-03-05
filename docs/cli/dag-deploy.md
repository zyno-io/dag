# dag-deploy

Submit a Helm chart to the DAG server and monitor the deployment.

## Usage

```sh
dag-deploy <chart-path> [options]
```

### Arguments

| Argument       | Description                                               |
| -------------- | --------------------------------------------------------- |
| `<chart-path>` | Path to a Helm chart directory, `.tgz`, or `.tar.gz` file |

If a directory is provided, it will be packaged into a `.tgz` tarball automatically.

### Options

| Option                       | Env Variable         | Default       | Description                                                    |
| ---------------------------- | -------------------- | ------------- | -------------------------------------------------------------- |
| `--server <url>`             | `DAG_SERVER_URL`     | —             | DAG server URL **(required)**                                  |
| `--repo <url>`               | `DAG_REPO_URL`       | auto-detected | Override the repository URL                                    |
| `--job-id <id>`              | `DAG_JOB_ID`         | auto-detected | Override the CI job ID                                         |
| `--job-token <token>`        | `DAG_JOB_TOKEN`      | auto-detected | Override the CI job token                                      |
| `--deploy-version <version>` | `DAG_DEPLOY_VERSION` | —             | Deployment version **(required)**                              |
| `--timeout <seconds>`        | `DAG_TIMEOUT`        | `300`         | Client-side timeout for waiting on deployment status (seconds) |
| `--values-file <path>`       | —                    | —             | YAML file to deep-merge into the chart's base `values.yaml`   |
| `--set <key=value>`          | —                    | —             | Set a dotted path to a literal string value (repeatable)       |
| `--set-json <key=json>`      | —                    | —             | Set a dotted path to a JSON-parsed value (repeatable)          |
| `--set-file <key=filepath>`  | —                    | —             | Set a dotted path to the contents of a file (repeatable)       |

### CI Auto-Detection

When running in a CI environment, `dag-deploy` automatically detects the repo URL, job ID, and job token from environment variables:

**GitLab CI** (detected via `GITLAB_CI`):
| Value | Source |
|-------|--------|
| Repo URL | `CI_PROJECT_URL` |
| Job ID | `CI_JOB_ID` |
| Job Token | `CI_JOB_TOKEN` |

**GitHub Actions** (detected via `GITHUB_ACTIONS`):

::: warning
Server-side GitHub job token verification is not yet implemented. GitHub Actions auto-detection works on the CLI side, but deployments will fail at the server validation step.
:::

| Value     | Source                                    |
| --------- | ----------------------------------------- |
| Repo URL  | `GITHUB_SERVER_URL/GITHUB_REPOSITORY`     |
| Job ID    | `GITHUB_RUN_ID`                           |
| Job Token | `GITHUB_TOKEN` or `ACTIONS_RUNTIME_TOKEN` |

## Exit Codes

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| `0`  | Deployment succeeded (`deployed` status)     |
| `1`  | Deployment failed (`failed` status or error) |

## Values Overrides

`dag-deploy` can modify the chart's `values.yaml` before packaging and uploading. When `--values-file` is provided, the specified YAML file is deep-merged into the chart's base `values.yaml` — nested objects are merged recursively, while scalars and arrays from the overlay replace the base values. Then `--set`, `--set-json`, and `--set-file` overrides are applied on top.

Values overrides require the chart path to be a directory (not a `.tgz`).

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version v1.2.3 \
    --values-file values-production.yaml \
    --set image.tag=v1.2.3
```

::: tip
Values set via `--set` are always strings. Use `--set-json` for typed values (numbers, booleans, objects, arrays):

```sh
--set-json 'resources={"limits":{"cpu":"500m","memory":"256Mi"}}'
--set-json 'replicas=3'
```
:::

## Examples

Deploy a chart directory:

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version v1.2.3
```

Deploy with values overrides:

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version v1.2.3 \
    --values-file values-staging.yaml \
    --set image.tag=$CI_COMMIT_SHA \
    --set-json 'replicas=3' \
    --set-file config.data=./config.json
```

Deploy a pre-packaged tarball:

```sh
dag-deploy my-app-1.2.3.tgz \
    --server https://dag.example.com \
    --deploy-version v1.2.3
```

Deploy with explicit credentials (outside CI):

```sh
dag-deploy ./chart \
    --server https://dag.example.com \
    --deploy-version v1.2.3 \
    --repo https://gitlab.com/org/my-app \
    --job-id 12345 \
    --job-token glcbt-abc123
```
