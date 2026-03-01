# IAC Repositories

## Overview

DAG pushes Helm charts to Infrastructure-as-Code (IAC) Git repositories. These repos serve as the single source of truth for what's deployed on your clusters — a core principle of GitOps.

## Repository Structure

A typical IAC repository might look like:

```
clusters/
  production/
    app-one/
      Chart.yaml
      values.yaml
      templates/
        ...
    app-two/
      Chart.yaml
      values.yaml
      templates/
        ...
  staging/
    app-one/
      Chart.yaml
      values.yaml
      templates/
        ...
```

Each app environment in DAG is configured with an `iacPath` that points to the directory where the chart should be placed (e.g. `clusters/production/app-one`).

## Access Tokens

IAC repos are configured with an access token that DAG uses for push access via HTTP Basic authentication. Generate a token with write access to the repository:

- **GitLab**: Project or group access token with `write_repository` scope
- **GitHub**: Fine-grained personal access token with `Contents: Read and write` permission

## Branching

By default, DAG pushes to the IAC repo's default branch. You can configure a different branch per app environment using the `iacBranch` field. This is useful for:

- **Staging environments**: Push to a `staging` branch that a separate process promotes to `main`
- **Review environments**: Push to per-branch IAC branches

## Concurrency

DAG uses mutex locks when pushing to IAC repositories. If multiple deployments target the same IAC repo simultaneously, they're serialized to prevent merge conflicts. The mutex key includes the IAC repo ID, so deployments to different IAC repos proceed in parallel.

## Commit Messages

DAG commits with a message that includes the source repo URL, IAC path, and CI job ID, making it easy to trace deployments in the IAC repo's Git history. For example:

```
deploy: https://gitlab.com/org/my-app → clusters/production/my-app (job 12345)
```
