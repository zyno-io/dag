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

```
pending → validating → pushing → pushed → monitoring → deployed
                 │           │                  │
                 └───────────┴──────────────────┴──→ failed
```

A deployment can transition to `failed` from any non-terminal status.

## Multi-cluster Deployments

An environment can contain multiple cluster targets. DAG monitors them in parallel and records an independent `pending`, `monitoring`, `deployed`, or `failed` outcome for each target. The parent deployment remains `monitoring` until every target is terminal; it is `deployed` only when all targets succeeded, otherwise it is `failed` with the failed-target summary.

## Terminal States

The two terminal states are `deployed` and `failed`. Once a deployment reaches a terminal state:

- The SSE connection is closed
- The `dag-deploy` CLI exits (code 0 for `deployed`, code 1 for `failed`)
- No further status changes occur

## Status Messages

Each status event includes a human-readable `message` field. On failure, the message describes what went wrong:

| Failure Point      | Example Message                                                    |
| ------------------ | ------------------------------------------------------------------ |
| Token verification | `Job token verification failed`                                    |
| IAC push           | `Failed to push chart to IAC repo`                                 |
| K8s monitoring     | `HelmRelease reconciliation failed: chart values validation error` |
| Timeout            | `Deployment timed out after 300 seconds`                           |
