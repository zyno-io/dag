# Getting Started

## Prerequisites

- A **Kubernetes** cluster with either FluxCD or plain Helm
- An **IAC Git repository** for storing Helm charts
- **PostgreSQL** 16+

## Install the Server

### Helm (Recommended)

Add the chart repository and install:

```sh
helm repo add zyno-io https://zyno-io.github.io/charts
helm repo update
helm install dag zyno-io/dag \
  --set postgres.host=your-pg-host \
  --set postgres.password=your-pg-password \
  --set config.cryptoSecret=your-crypto-secret
```

Database migrations run automatically on install and upgrade via a Helm hook. See [Helm Chart](./deployment/helm-chart.md) for the full list of configurable values, or refer to [Server Configuration](./server/configuration.md) for details on each setting.

### Docker

```sh
docker pull ghcr.io/zyno-io/dag/server:latest

docker run -p 3000:3000 \
  -e APP_ENV=production \
  -e PG_HOST=your-pg-host \
  -e PG_DATABASE=dag \
  -e PG_USER=dag \
  -e PG_PASSWORD_SECRET=your-pg-password \
  -e CRYPTO_SECRET=your-crypto-secret \
  ghcr.io/zyno-io/dag/server:latest
```

Run migrations before starting the server (and after each upgrade):

```sh
docker run --rm \
  -e PG_HOST=your-pg-host -e PG_DATABASE=dag -e PG_USER=dag -e PG_PASSWORD_SECRET=your-pg-password \
  ghcr.io/zyno-io/dag/server:latest \
  node dist/bootstrap.js migration:run
```

### From Source

```sh
git clone https://github.com/zyno-io/dag.git
cd dag
yarn install
yarn workspace @zyno-io/dag-shared build
yarn workspace @zyno-io/dag build
```

Run migrations before starting the server (and after each upgrade):

```sh
node packages/server/dist/bootstrap.js migration:run
```

Then start the server:

```sh
node packages/server/dist/bootstrap.js server:start
```

Requires Node.js 22+ and PostgreSQL 16+. See [Server Configuration](./server/configuration.md) for the required environment variables.

## Install the CLI

The CLI (`dag-deploy`) runs in your CI pipeline.

### Docker (for CI containers)

```sh
docker pull ghcr.io/zyno-io/dag/cli:latest
```

### npm

```sh
npm install -g @zyno-io/dag-cli
```

## Setup

### 1. Deploy the Server

Follow the installation steps above to get the DAG server running.

### 2. Set Up an IAC Repository

Configure the Git repository where DAG will push Helm charts. You'll need a repository URL and an access token with write permissions. See [IAC Repositories](./guides/iac-repos.md).

### 3. Set Up a Cluster

Register the Kubernetes cluster DAG will monitor for deployment status. This involves creating a service account with the right permissions and extracting its token and CA certificate. See [Clusters](./guides/clusters.md).

### 4. Create an App

Register your application and map its branches to IAC paths, clusters, and Helm configurations. See [Creating Apps](./guides/creating-apps.md).

### 5. Deploy from CI

Add `dag-deploy` to your CI pipeline:

```sh
dag-deploy ./chart \
  --server https://dag.example.com \
  --deploy-version $CI_COMMIT_SHA
```

The CLI will auto-detect your CI environment (GitLab CI or GitHub Actions), submit the chart, and stream deployment status in real time.

See [CI Integration](./cli/ci-integration.md) for complete pipeline examples.
