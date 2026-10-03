# API Reference

## POST /api/deploy

Submit a new deployment.

### Request

`Content-Type: multipart/form-data`

| Field         | Type     | Required | Description                                                     |
| ------------- | -------- | -------- | --------------------------------------------------------------- |
| `repoUrl`     | `string` | Yes      | Git repository URL                                              |
| `jobId`       | `string` | Yes      | CI job ID                                                       |
| `jobToken`    | `string` | Yes      | CI job authentication token                                     |
| `environment` | `string` | No       | Target environment name when a branch has multiple environments |
| `version`     | `string` | Yes      | Deployment version (e.g. commit SHA, semver tag)                |
| `chart`       | `file`   | Yes      | Helm chart tarball (`.tgz`)                                     |

### Response

```json
{
    "deploymentId": "01924f5a-7b3c-7d8e-9f1a-2b3c4d5e6f7a"
}
```

### Errors

| Status | Condition                                                                                |
| ------ | ---------------------------------------------------------------------------------------- |
| `400`  | Missing required fields, or multiple environments match the branch without `environment` |
| `401`  | Job token verification failed                                                            |
| `404`  | No app configured for the given repo URL, or no matching environment configured          |

Rollout budgets come from the environment's targets, not the submitting client. The resolved `monitorTimeoutSecs` for every target is pinned when the deployment is queued.

## Environment Target Configuration

The authenticated environment create/update endpoints accept an optional `monitorTimeoutSecs` field on each item of the `targets` array. Use a whole number from 1 to 2147483647 seconds, or null/omit it to use the server default. Environment responses return the nullable configured value; deployment responses and SSE target events return the resolved snapshot value. Managing this setting requires the same IaC repository permissions as editing the target destination.

For example, an environment may include independent budgets:

```json
{
    "targets": [
        { "clusterId": 1, "helmType": "flux", "helmNamespace": "staging", "helmName": "my-app", "monitorTimeoutSecs": 300 },
        { "clusterId": 2, "helmType": "flux", "helmNamespace": "staging", "helmName": "my-app", "monitorTimeoutSecs": 28800 }
    ]
}
```

The other required environment fields still apply. Editing these targets affects future deployments.

## POST /api/get/chart

Download the currently deployed chart from the IaC repository as a gzipped tarball.

### Request

`Content-Type: application/json`

| Field         | Type     | Required | Description                                                     |
| ------------- | -------- | -------- | --------------------------------------------------------------- |
| `repoUrl`     | `string` | Yes      | Git repository URL                                              |
| `jobId`       | `string` | Yes      | CI job ID                                                       |
| `jobToken`    | `string` | Yes      | CI job authentication token                                     |
| `environment` | `string` | No       | Target environment name when a branch has multiple environments |

### Response

`Content-Type: application/gzip`

The response body is a `.tgz` archive of the chart directory.

### Errors

| Status | Condition                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Missing required fields, multiple environments match the branch without `environment`, or IaC path resolves outside the repository |
| `401`  | Job token verification failed                                                                                                      |
| `404`  | No app configured for the given repo URL, no matching environment, or chart directory not found                                    |

## POST /api/get/values

Fetch the currently deployed `values.yaml` from the IaC repository, returned as JSON.

### Request

`Content-Type: application/json`

| Field         | Type     | Required | Description                                                     |
| ------------- | -------- | -------- | --------------------------------------------------------------- |
| `repoUrl`     | `string` | Yes      | Git repository URL                                              |
| `jobId`       | `string` | Yes      | CI job ID                                                       |
| `jobToken`    | `string` | Yes      | CI job authentication token                                     |
| `environment` | `string` | No       | Target environment name when a branch has multiple environments |

### Response

```json
{
    "replicaCount": 3,
    "image": {
        "repository": "my-app",
        "tag": "v1.2.3"
    }
}
```

### Errors

| Status | Condition                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Missing required fields, multiple environments match the branch without `environment`, IaC path resolves outside the repository, or malformed YAML |
| `401`  | Job token verification failed                                                                                                                      |
| `404`  | No app configured for the given repo URL, no matching environment, or `values.yaml` not found                                                      |

## GET /api/deployments/:id/events

Subscribe to real-time deployment status updates via Server-Sent Events (SSE).

### Path Parameters

| Parameter | Type     | Description          |
| --------- | -------- | -------------------- |
| `id`      | `string` | Deployment ID (UUID) |

### Response

The response is an SSE stream. Each event has:

- **Event type**: `status`
- **Data**: JSON-encoded `DeploymentStatusEvent`

```typescript
interface DeploymentStatusEvent {
    status: DeploymentStatus;
    message: string;
}
```

For multi-cluster deployments, the server also emits `target` events as each target changes:

```typescript
interface DeploymentTargetStatusEvent {
    target: {
        id: string;
        clusterId: number;
        clusterName: string;
        monitorTimeoutSecs: number;
        status: 'pending' | 'monitoring' | 'deployed' | 'failed';
        message: string;
    };
}
```

Where `DeploymentStatus` is one of: `pending`, `validating`, `pushing`, `pushed`, `monitoring`, `deployed`, `failed`.

### Behavior

- Returns `404` if the deployment is not found
- If the deployment is already terminal (`deployed` or `failed`), sends its target snapshot, then one final parent event and closes the connection
- Otherwise, sends the current status immediately, then streams updates as they occur
- Replays the current state of every cluster target before the parent status frame
- Sends a `heartbeat` event with `{}` data every 15 seconds while non-terminal, even without rollout progress
- The connection closes automatically when a terminal status is reached

### Example

```sh
curl -N https://dag.example.com/api/deployments/01924f5a-7b3c-7d8e-9f1a-2b3c4d5e6f7a/events
```

```
event: status
data: {"status":"validating","message":"Verifying job token"}

event: status
data: {"status":"pushing","message":"Pushing chart to IAC repo"}

event: status
data: {"status":"monitoring","message":"Monitoring deployment"}

event: status
data: {"status":"deployed","message":"Deployment successful"}
```
