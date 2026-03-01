# CI Integration

## GitLab CI

```yaml
stages:
  - build
  - deploy

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t my-app:$CI_COMMIT_SHA .
    - docker push my-app:$CI_COMMIT_SHA

deploy:
  stage: deploy
  image: ghcr.io/zyno-io/dag/cli:latest
  script:
    - dag-inject-values chart/values.yaml --set image.tag=$CI_COMMIT_SHA
    - dag-deploy ./chart
      --server https://dag.example.com
      --deploy-version $CI_COMMIT_SHA
```

In GitLab CI, `dag-deploy` auto-detects:

- **Repo URL** from `CI_PROJECT_URL`
- **Job ID** from `CI_JOB_ID`
- **Job Token** from `CI_JOB_TOKEN`

No additional configuration is needed.

## GitHub Actions

::: warning
GitHub Actions support is planned but not yet implemented on the server side. Job token verification for GitHub will fail at runtime until this is completed.
:::

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/zyno-io/dag/cli:latest
    steps:
      - uses: actions/checkout@v4

      - name: Inject values
        run: dag-inject-values chart/values.yaml --set image.tag=${{ github.sha }}

      - name: Deploy
        run: |
          dag-deploy ./chart \
            --server https://dag.example.com \
            --deploy-version ${{ github.sha }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The CLI auto-detects:

- **Repo URL** from `GITHUB_SERVER_URL` and `GITHUB_REPOSITORY`
- **Job ID** from `GITHUB_RUN_ID`
- **Job Token** from `GITHUB_TOKEN` or `ACTIONS_RUNTIME_TOKEN`

## Environment Variables

Instead of CLI flags, you can set environment variables. This is useful for configuring DAG once in your CI project settings:

| Variable             | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `DAG_SERVER_URL`     | DAG server URL                                                 |
| `DAG_REPO_URL`       | Override auto-detected repo URL                                |
| `DAG_JOB_ID`         | Override auto-detected job ID                                  |
| `DAG_JOB_TOKEN`      | Override auto-detected job token                               |
| `DAG_DEPLOY_VERSION` | Deployment version                                             |
| `DAG_TIMEOUT`        | Client-side timeout for waiting on deployment status (seconds) |

## Using the Docker Image

The `ghcr.io/zyno-io/dag/cli` image contains both `dag-deploy` and `dag-inject-values`. Use it as your CI job image:

```yaml
# GitLab CI
deploy:
  image: ghcr.io/zyno-io/dag/cli:latest

# GitHub Actions
jobs:
  deploy:
    container:
      image: ghcr.io/zyno-io/dag/cli:latest
```
