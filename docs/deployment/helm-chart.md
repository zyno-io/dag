# Helm Chart

DAG provides an official Helm chart for deploying the server to Kubernetes.

## Installation

```sh
helm repo add zyno-io https://zyno-io.github.io/charts
helm repo update
helm install dag zyno-io/dag
```

## Migrations

Database migrations run automatically on install and upgrade via a Helm pre-install/pre-upgrade hook. No manual migration step is needed.

## Values

### Image

| Value              | Default                          | Description             |
| ------------------ | -------------------------------- | ----------------------- |
| `image.repository` | `ghcr.io/zyno-io/dag/server`    | Container image         |
| `image.tag`        | Chart `appVersion`               | Image tag               |
| `image.pullPolicy` | `IfNotPresent`                   | Pull policy             |
| `imagePullSecrets` | `[]`                             | Image pull secrets      |
| `replicaCount`     | `1`                              | Number of replicas      |

### PostgreSQL

| Value               | Default | Description       |
| ------------------- | ------- | ----------------- |
| `postgres.host`                   | —       | Database host                              |
| `postgres.port`                   | `5432`  | Database port                              |
| `postgres.user`                   | `dag`   | Database user                              |
| `postgres.password`               | —       | Database password                          |
| `postgres.database`               | `dag`   | Database name                              |
| `postgres.ssl`                    | `false` | Enable SSL for database connections        |
| `postgres.sslRejectUnauthorized`  | `true`  | Reject unauthorized SSL certificates       |

### Application Config

| Value                             | Default      | Description                                       |
| --------------------------------- | ------------ | ------------------------------------------------- |
| `config.appEnv`                   | `production` | Application environment                           |
| `config.deployMonitorTimeoutSecs` | `300`        | Timeout for monitoring Kubernetes deployments      |
| `config.cryptoSecret`             | —            | Secret key for encryption (must be 32 characters) |

### Networking

| Value               | Default     | Description        |
| ------------------- | ----------- | ------------------ |
| `service.type`      | `ClusterIP` | Service type       |
| `service.port`      | `3000`      | Service port       |
| `ingress.enabled`   | `false`     | Enable ingress     |
| `ingress.className` | —           | Ingress class name |
| `ingress.hosts`     | `[]`        | Ingress hosts      |
| `ingress.tls`       | `[]`        | Ingress TLS config |

### Deployment

| Value                       | Default | Description    |
| --------------------------- | ------- | -------------- |
| `deployment.resources`      | `{}`    | CPU/memory     |
| `deployment.nodeSelector`   | `{}`    | Node selector  |
| `deployment.tolerations`    | `[]`    | Tolerations    |
| `deployment.affinity`       | `{}`    | Affinity rules |
| `deployment.podAnnotations` | `{}`    | Pod annotations |
| `deployment.podLabels`      | `{}`    | Pod labels     |

## Example

```yaml
postgres:
  host: postgres.default.svc.cluster.local
  password: my-secret-password

config:
  cryptoSecret: my-32-character-secret-key-here!

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: dag.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: dag-tls
      hosts:
        - dag.example.com
```
