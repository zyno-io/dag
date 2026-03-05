# dag-get-chart

Download the currently deployed Helm chart from the IaC repository as a `.tgz` archive.

## Usage

```sh
dag-get-chart <output-path> [options]
```

### Arguments

| Argument        | Description                                |
| --------------- | ------------------------------------------ |
| `<output-path>` | File path to write the downloaded `.tgz` to |

### Options

| Option                | Env Variable     | Default       | Description                       |
| --------------------- | ---------------- | ------------- | --------------------------------- |
| `--server <url>`      | `DAG_SERVER_URL` | —             | DAG server URL **(required)**     |
| `--repo <url>`        | `DAG_REPO_URL`   | auto-detected | Override the repository URL       |
| `--job-id <id>`       | `DAG_JOB_ID`     | auto-detected | Override the CI job ID            |
| `--job-token <token>` | `DAG_JOB_TOKEN`  | auto-detected | Override the CI job token         |

### CI Auto-Detection

CI environment variables are auto-detected in the same way as [`dag-deploy`](./dag-deploy.md#ci-auto-detection).

## Exit Codes

| Code | Meaning                 |
| ---- | ----------------------- |
| `0`  | Chart downloaded        |
| `1`  | Error (see stderr)      |

## Examples

Download the chart in a GitLab CI pipeline:

```sh
dag-get-chart ./deployed-chart.tgz \
    --server https://dag.example.com
```

Download with explicit credentials:

```sh
dag-get-chart ./deployed-chart.tgz \
    --server https://dag.example.com \
    --repo https://gitlab.com/org/my-app \
    --job-id 12345 \
    --job-token glcbt-abc123
```
