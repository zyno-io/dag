# Clusters

## Overview

DAG monitors Kubernetes clusters to verify that deployments succeed after pushing charts to IAC repositories. Clusters are registered with API credentials that DAG uses to poll for deployment status.

## Cluster Registration

Each cluster requires:

| Field                 | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `name`                | Human-readable cluster name                                          |
| `apiUrl`              | Kubernetes API server URL (e.g. `https://k8s.example.com:6443`)      |
| `serviceAccountToken` | Bearer token for a service account with read access                  |
| `caCert`              | CA certificate for TLS verification (optional if using a trusted CA) |

## Service Account Setup

Create a service account with the minimum permissions DAG needs to monitor deployments:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
    name: dag-monitor
    namespace: dag
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
    name: dag-monitor
rules:
    # For plain Helm monitoring
    - apiGroups: ['']
      resources: ['secrets']
      verbs: ['list']
    # For FluxCD monitoring
    - apiGroups: ['helm.toolkit.fluxcd.io']
      resources: ['helmreleases']
      verbs: ['get']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
    name: dag-monitor
subjects:
    - kind: ServiceAccount
      name: dag-monitor
      namespace: dag
roleRef:
    kind: ClusterRole
    name: dag-monitor
    apiGroup: rbac.authorization.k8s.io
```

## Flux vs Plain Helm

DAG supports two monitoring modes, configured per app environment via the `helmType` field:

### FluxCD (`flux`)

DAG watches `HelmRelease` custom resources from `helm.toolkit.fluxcd.io/v2`. It polls the resource's status conditions every 5 seconds, looking for:

- **Ready = True**: Deployment succeeded
- **Ready = False** with a failure reason: Deployment failed

Use this mode when your cluster uses FluxCD to reconcile Helm charts from Git.

### Plain Helm (`plain`)

DAG watches Helm release secrets (labeled `owner=helm`) in the target namespace. It polls every 5 seconds, looking for:

- Status `deployed`: Deployment succeeded
- Status indicating failure: Deployment failed

Use this mode when your cluster applies Helm charts directly (e.g. via a Helm operator or custom controller).

## Monitoring Timeout

DAG polls for up to `DEPLOY_MONITOR_TIMEOUT_SECS` seconds (default: 300). If the deployment doesn't reach a terminal state within this window, the deployment is marked as `failed` with a timeout message.
