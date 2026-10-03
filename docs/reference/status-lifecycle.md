# Status Lifecycle

Every deployment in DAG progresses through a series of statuses. These statuses are reported in real time via the SSE events stream.

## Statuses

| Status       | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `pending`    | Deployment created and queued for processing                                 |
| `validating` | Job token has been verified; deployment is starting                          |
| `pushing`    | Cloning/updating the IAC repo, extracting the chart, committing, and pushing |
| `pushed`     | Chart successfully committed to the IAC repository                           |
| `monitoring` | Polling every configured Kubernetes target for deployment status             |
| `deployed`   | Deployment completed successfully (terminal)                                 |
| `failed`     | Deployment failed at any stage (terminal)                                    |

## Flow

```text
pending → validating → pushing → pushed → monitoring → deployed
                 │           │                  │
                 └───────────┴──────────────────┴──→ failed
```

A deployment can transition to `failed` from any non-terminal status.

## Multi-cluster Deployments

An environment can contain multiple cluster targets. DAG monitors them in parallel and records an independent `pending`, `monitoring`, `deployed`, or `failed` outcome for each target. The parent deployment remains `monitoring` until every target is terminal; it is `deployed` only when all targets succeeded, otherwise it is `failed` with the failed-target summary.

Each target uses its own snapshotted `monitorTimeoutSecs` budget. One target timing out does not shorten another target's monitor. The CLI waits for the parent terminal result without an overall deadline; 15-second SSE heartbeats keep the connection alive during quiet rollout periods. A 30-second silence produces a connection error with an unknown outcome, leaving server-side monitoring running.

## Terminal States

The two terminal states are `deployed` and `failed`. Once a deployment reaches a terminal state:

- The SSE connection is closed
- The `dag-deploy` CLI exits (code 0 for `deployed`, code 1 for `failed`)
- No further status changes occur

## Status Messages

Each status event includes a human-readable `message` field. On failure, the message describes what went wrong:

| Failure Point      | Example Message                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| Token verification | `Job token verification failed`                                        |
| IAC push           | `Failed to push chart to IAC repo`                                     |
| K8s monitoring     | `HelmRelease reconciliation failed: chart values validation error`     |
| Timeout            | `Timeout waiting for HelmRelease my-app on cluster 1 (...) after 300s` |
