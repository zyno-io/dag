# DAG — Deploy Applications via GitOps

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Push Helm charts from CI pipelines to IAC repos and monitor Kubernetes deployments in real time.

## Overview

DAG is a GitOps deployment automation system. It receives Helm charts from CI pipelines, commits them to your Infrastructure-as-Code repository, and monitors the Kubernetes cluster until the deployment succeeds or fails — streaming status updates back to your pipeline in real time via SSE.

```
┌─────────────────┐         HTTP          ┌─────────────────┐
│   CI Pipeline   │ ──────────────────▶   │   DAG Server    │
│  (dag-deploy)   │ ◀────────────────── │                 │
│                 │         SSE           │                 │
└─────────────────┘                       └────────┬────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                              ┌──────────┐  ┌──────────┐  ┌──────────┐
                              │ IAC Repo │  │  GitLab/ │  │   K8s    │
                              │  (Git)   │  │  GitHub  │  │ Cluster  │
                              └──────────┘  └──────────┘  └──────────┘
```

## Features

- **GitOps Native** — commits Helm charts to your IAC Git repo, keeping Git as the single source of truth. DAG never applies changes to Kubernetes directly.
- **Real-Time Monitoring** — streams deployment status via SSE so your CI pipeline shows live progress from `pending` through `deployed`.
- **Flux & Plain Helm** — monitors both FluxCD HelmRelease CRDs and plain Helm release secrets.
- **CI Auto-Detection** — automatically picks up repo URL, job ID, and job token from GitLab CI and GitHub Actions environments.
- **Concurrent Safety** — serializes deployments to the same IAC repo with mutex locks to prevent merge conflicts.

## Quick Start

### Prerequisites

- Node.js 22+ (or use the Docker images)
- PostgreSQL 16+
- A Kubernetes cluster with FluxCD or plain Helm
- An IAC Git repository

### Install

**Server:**

```sh
docker pull ghcr.io/zyno-io/dag/server:latest
```

**CLI:**

```sh
docker pull ghcr.io/zyno-io/dag/cli:latest
# OR
npm install -g @zyno-io/dag-cli
```

### Deploy

```sh
dag-inject-values chart/values.yaml --set image.tag=$CI_COMMIT_SHA

dag-deploy ./chart \
  --server https://dag.example.com \
  --deploy-version $CI_COMMIT_SHA
```

The CLI packages the chart, submits it to the server, and streams deployment status until completion.

## CLI Commands

### `dag-deploy`

Submit a Helm chart for deployment.

```
dag-deploy <chart-path> [options]
```

| Option                   | Env Variable         | Description                          |
| ------------------------ | -------------------- | ------------------------------------ |
| `--server <url>`         | `DAG_SERVER_URL`     | DAG server URL **(required)**        |
| `--deploy-version <ver>` | `DAG_DEPLOY_VERSION` | Deployment version **(required)**    |
| `--repo <url>`           | `DAG_REPO_URL`       | Override auto-detected repo URL      |
| `--job-id <id>`          | `DAG_JOB_ID`         | Override auto-detected job ID        |
| `--job-token <token>`    | `DAG_JOB_TOKEN`      | Override auto-detected job token     |
| `--timeout <seconds>`    | `DAG_TIMEOUT`        | Client-side timeout (default: `300`) |

Accepts a chart directory, `.tgz`, or `.tar.gz`. Exits `0` on success, `1` on failure.

### `dag-inject-values`

Modify a YAML values file before deploying.

```
dag-inject-values <values-file> [options]
```

| Option                  | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `--set <key=value>`     | Set a dotted path to a string value (repeatable)    |
| `--set-file <key=path>` | Set a dotted path to a file's contents (repeatable) |

```sh
dag-inject-values values.yaml \
  --set image.tag=v1.2.3 \
  --set-file config.json=/path/to/config.json
```

## CI Integration

### GitLab CI

```yaml
deploy:
  stage: deploy
  image: ghcr.io/zyno-io/dag/cli:latest
  script:
    - dag-inject-values chart/values.yaml --set image.tag=$CI_COMMIT_SHA
    - dag-deploy ./chart
      --server https://dag.example.com
      --deploy-version $CI_COMMIT_SHA
```

Repo URL, job ID, and job token are auto-detected from GitLab CI environment variables.

### GitHub Actions

```yaml
deploy:
  runs-on: ubuntu-latest
  container:
    image: ghcr.io/zyno-io/dag/cli:latest
  steps:
    - uses: actions/checkout@v4
    - name: Deploy
      run: |
        dag-inject-values chart/values.yaml --set image.tag=${{ github.sha }}
        dag-deploy ./chart \
          --server https://dag.example.com \
          --deploy-version ${{ github.sha }}
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Server Deployment

### Helm (Recommended)

```sh
helm repo add dag https://signal24.github.io/dag
helm install dag dag/dag \
  --set postgres.host=your-pg-host \
  --set postgres.password=your-pg-password \
  --set config.cryptoSecret=your-secret
```

### Docker

```sh
docker run -d \
  -e APP_ENV=production \
  -e PG_HOST=localhost -e PG_DATABASE=dag -e PG_USER=dag -e PG_PASSWORD_SECRET=secret \
  -p 3000:3000 \
  ghcr.io/zyno-io/dag/server:latest
```

### Essential Environment Variables

| Variable                      | Default    | Description                                                            |
| ----------------------------- | ---------- | ---------------------------------------------------------------------- |
| `APP_ENV`                     | —          | Application environment                                                |
| `PORT`                        | `3000`     | HTTP server port                                                       |
| `DATA_DIR`                    | `/tmp/dag` | Storage for staged charts and cloned IAC repos (rarely needs changing) |
| `PG_HOST`                     | —          | PostgreSQL host                                                        |
| `PG_DATABASE`                 | —          | PostgreSQL database                                                    |
| `PG_USER`                     | —          | PostgreSQL user                                                        |
| `PG_PASSWORD_SECRET`          | —          | PostgreSQL password                                                    |
| `DEPLOY_MONITOR_TIMEOUT_SECS` | `300`      | K8s deployment monitoring timeout                                      |

See the [full documentation](https://zyno-io.github.io/dag/server/configuration) for all options including observability settings.

## Documentation

Full documentation is available at [zyno-io.github.io/dag](https://zyno-io.github.io/dag/).

## License

[MIT](LICENSE)
