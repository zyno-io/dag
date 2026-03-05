# dag-get-values

Fetch the currently deployed `values.yaml` from the IaC repository and print it as JSON to stdout.

## Usage

```sh
dag-get-values [options]
```

### Options

| Option                | Env Variable     | Default       | Description                       |
| --------------------- | ---------------- | ------------- | --------------------------------- |
| `--server <url>`      | `DAG_SERVER_URL` | —             | DAG server URL **(required)**     |
| `--repo <url>`        | `DAG_REPO_URL`   | auto-detected | Override the repository URL       |
| `--job-id <id>`       | `DAG_JOB_ID`     | auto-detected | Override the CI job ID            |
| `--job-token <token>` | `DAG_JOB_TOKEN`  | auto-detected | Override the CI job token         |

### CI Auto-Detection

CI environment variables are auto-detected in the same way as [`dag-deploy`](./dag-deploy.md#ci-auto-detection).

## Output

Prints the values as pretty-printed JSON to stdout:

```json
{
  "replicaCount": 3,
  "image": {
    "repository": "my-app",
    "tag": "v1.2.3"
  }
}
```

## Exit Codes

| Code | Meaning                 |
| ---- | ----------------------- |
| `0`  | Values printed          |
| `1`  | Error (see stderr)      |

## Examples

Print current values in a CI pipeline:

```sh
dag-get-values --server https://dag.example.com
```

Pipe into `jq` to extract a specific value:

```sh
dag-get-values --server https://dag.example.com | jq -r '.image.tag'
```

Save to a file:

```sh
dag-get-values --server https://dag.example.com > current-values.json
```
