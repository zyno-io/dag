# DAG Project Overview

## Purpose
DAG is a GitOps deployment automation tool. A CLI runs in CI/CD pipelines, sends Helm charts to a server, which pushes them to an IAC (Infrastructure as Code) repo and monitors K8s deployments.

## Tech Stack
- Monorepo with yarn workspaces: `packages/shared`, `packages/server`, `packages/cli`
- Server: `@zyno-io/dk-server-foundation` (Deepkit framework) + PostgreSQL
- CLI: commander, chalk, ora, eventsource
- Build/test: `dksf-dev build`, `dksf-dev test`

## Key Packages
- `@zyno-io/dag` (server), `@zyno-io/dag-cli`, `@zyno-io/dag-shared`

## Architecture
- Deploy flow: CLI → POST /api/deploy → background processDeployment → IacRepoService push → K8sMonitorService watch
- Real-time updates: SSE via broadcast channels (GET /api/deployments/:id/events)
- Deployment statuses: pending → validating → pushing → pushed → monitoring → deployed/failed

## Commands
- Build: `yarn workspace @zyno-io/dag exec dksf-dev build`
- Test: `yarn workspace @zyno-io/dag exec dksf-dev test`
- Format: oxfmt (`.oxfmtrc.json`), Lint: oxlint (`.oxlintrc.json`)
