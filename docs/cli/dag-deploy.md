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

## Examples

Deploy a chart directory:

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version v1.2.3
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
