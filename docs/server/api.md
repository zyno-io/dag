# API Reference

## POST /api/deploy

Submit a new deployment.

### Request

`Content-Type: multipart/form-data`

| Field      | Type     | Required | Description                                      |
| ---------- | -------- | -------- | ------------------------------------------------ |
| `repoUrl`  | `string` | Yes      | Git repository URL                               |
| `jobId`    | `string` | Yes      | CI job ID                                        |
| `jobToken` | `string` | Yes      | CI job authentication token                      |
| `version`  | `string` | Yes      | Deployment version (e.g. commit SHA, semver tag) |
| `chart`    | `file`   | Yes      | Helm chart tarball (`.tgz`)                      |

### Response

```json
{
    "deploymentId": "01924f5a-7b3c-7d8e-9f1a-2b3c4d5e6f7a"
}
```

### Errors

| Status | Condition                                                                             |
| ------ | ------------------------------------------------------------------------------------- |
| `400`  | Missing required fields                                                               |
| `401`  | Job token verification failed                                                         |
| `404`  | No app configured for the given repo URL, or no environment configured for the branch |

## POST /api/get/chart

Download the currently deployed chart from the IaC repository as a gzipped tarball.

### Request

`Content-Type: application/json`

| Field      | Type     | Required | Description                 |
| ---------- | -------- | -------- | --------------------------- |
| `repoUrl`  | `string` | Yes      | Git repository URL          |
| `jobId`    | `string` | Yes      | CI job ID                   |
| `jobToken` | `string` | Yes      | CI job authentication token |

### Response

`Content-Type: application/gzip`

The response body is a `.tgz` archive of the chart directory.

### Errors

| Status | Condition                                                                             |
| ------ | ------------------------------------------------------------------------------------- |
| `400`  | Missing required fields, or IaC path resolves outside the repository                  |
| `401`  | Job token verification failed                                                         |
| `404`  | No app configured for the given repo URL, no environment for the branch, or chart directory not found |

## POST /api/get/values

Fetch the currently deployed `values.yaml` from the IaC repository, returned as JSON.

### Request

`Content-Type: application/json`

| Field      | Type     | Required | Description                 |
| ---------- | -------- | -------- | --------------------------- |
| `repoUrl`  | `string` | Yes      | Git repository URL          |
| `jobId`    | `string` | Yes      | CI job ID                   |
| `jobToken` | `string` | Yes      | CI job authentication token |

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

| Status | Condition                                                                             |
| ------ | ------------------------------------------------------------------------------------- |
| `400`  | Missing required fields, IaC path resolves outside the repository, or malformed YAML  |
| `401`  | Job token verification failed                                                         |
| `404`  | No app configured for the given repo URL, no environment for the branch, or `values.yaml` not found |

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

Where `DeploymentStatus` is one of: `pending`, `validating`, `pushing`, `pushed`, `monitoring`, `deployed`, `failed`.

### Behavior

- Returns `404` if the deployment is not found
- If the deployment is already in a terminal state (`deployed` or `failed`), sends one final event and closes the connection
- Otherwise, sends the current status immediately, then streams updates as they occur
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
