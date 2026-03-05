# Architecture

## System Overview

DAG is a GitOps deployment automation system. It enables CI/CD pipelines to deploy Helm charts to Kubernetes clusters by pushing them to Infrastructure-as-Code (IAC) repositories.

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

## Packages

The project is a monorepo with three packages:

| Package           | Description                                   |
| ----------------- | --------------------------------------------- |
| `packages/shared` | Shared TypeScript types and enums             |
| `packages/server` | HTTP API server                               |
| `packages/cli`    | CLI tool (`dag-deploy`)                       |

## Request Flow

### 1. CI Pipeline Submits Deployment

The CI pipeline packages a Helm chart and calls `dag-deploy`, which sends a `POST /api/deploy` request to the DAG server with the chart tarball, repo URL, job ID, job token, and version.

### 2. Server Validates and Processes

The server:

1. Looks up the **App** by the normalized repo URL
2. Verifies the **job token** with the git provider (GitLab API) and resolves the branch
3. Finds the **AppEnvironment** matching the branch
4. Creates a **Deployment** record (status: `pending`)
5. Kicks off deployment processing in the background

### 3. Deployment Processing

The deployment runs through these stages:

| Stage    | Status                 | Action                                                             |
| -------- | ---------------------- | ------------------------------------------------------------------ |
| Validate | `validating`           | Signal that job token has been verified                            |
| Push     | `pushing`              | Clone/update IAC repo, extract chart, update version, commit, push |
| Pushed   | `pushed`               | Chart committed to IAC repo                                        |
| Monitor  | `monitoring`           | Poll Kubernetes for deployment status (Flux or plain Helm)         |
| Done     | `deployed` or `failed` | Final state                                                        |

Each status change is broadcast via an in-process channel so that SSE clients receive real-time updates.

### 4. Client Monitors Progress

The CLI subscribes to `GET /api/deployments/:id/events` (Server-Sent Events) and displays a live spinner with colored status updates. It exits with code 0 on success or 1 on failure.

## Key Design Decisions

- **GitOps model**: DAG never talks to Kubernetes to _apply_ changes — it pushes to an IAC repo and lets the cluster's reconciler (Flux or Helm operator) handle the actual deployment.
- **Mutex on IAC repos**: Concurrent deployments to the same IAC repo are serialized with a mutex to prevent conflicts.
- **SSE for real-time updates**: Server-Sent Events provide a simple, firewall-friendly mechanism for streaming status updates back to CI pipelines.
- **Job token verification**: Every deployment request is authenticated by verifying the CI job token with the git provider's API.
