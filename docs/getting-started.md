# Getting Started

## Prerequisites

- **Node.js** 22+
- **PostgreSQL** 16+
- **Redis** (for job queue and broadcast channels)
- A **Kubernetes** cluster with either FluxCD or plain Helm
- An **IAC Git repository** for storing Helm charts

## Installation

### Server

Pull the server Docker image:

```sh
docker pull ghcr.io/signal24/dag/server:latest
```

Or build from source:

```sh
git clone https://github.com/signal24/dag.git
cd dag
yarn install
yarn build
```

### CLI

Pull the CLI Docker image (for use in CI containers):

```sh
docker pull ghcr.io/signal24/dag/cli:latest
```

Or install globally:

```sh
npm install -g @zyno-io/dag-cli
```

## Quick Start

### 1. Start the Server

Configure the required environment variables and start the server:

```sh
export APP_ENV=production
export PG_HOST=localhost
export PG_DATABASE=dag
export PG_USER=dag
export PG_PASSWORD_SECRET=your-password
export REDIS_HOST=localhost

# Start the server
node packages/server/dist/bootstrap.js
```

### 2. Configure an App

Register your application repository, IAC repository, cluster, and environment mapping in the database. See [Server Configuration](./server/configuration.md) for details.

### 3. Deploy from CI

Add `dag-deploy` to your CI pipeline:

```sh
dag-deploy ./chart \
  --server https://dag.example.com \
  --deploy-version $CI_COMMIT_SHA
```

The CLI will auto-detect your CI environment (GitLab CI or GitHub Actions), submit the chart, and stream deployment status in real time.

See [CI Integration](./cli/ci-integration.md) for complete pipeline examples.
