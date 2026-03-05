# App Charts

## Chart Requirements

DAG accepts Helm charts as a directory, `.tgz`, or `.tar.gz` tarball. When you provide a directory, `dag-deploy` packages it into a tarball automatically.

Your chart should include a `Chart.yaml` with a `version` field. If present, DAG will update it to match the `--deploy-version` value you specify. If `Chart.yaml` is missing, version updating is silently skipped.

## Chart Packaging

### From a Directory

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version v1.2.3
```

The CLI tars the directory contents and uploads the resulting `.tgz` to the server.

### From a Pre-Built Tarball

If your build process already produces a `.tgz`, pass it directly:

```sh
helm package ./charts/my-app
dag-deploy my-app-1.2.3.tgz \
    --server https://dag.example.com \
    --deploy-version v1.2.3
```

## Version Handling

If `Chart.yaml` contains a `version:` line, DAG replaces it with the `--deploy-version` value before committing the chart to the IAC repository. This ensures the chart version in the IAC repo corresponds to the version being deployed. If no `version:` line exists, the file is left unchanged.

## Injecting Values

Use `--values-file`, `--set`, `--set-json`, and `--set-file` to modify the chart's base `values.yaml` at deploy time. When `--values-file` is provided, the specified file is deep-merged into the chart's `values.yaml` (nested objects are merged, scalars and arrays from the overlay win). Then `--set`, `--set-json`, and `--set-file` are applied on top. Use `--set-json` for typed values (numbers, booleans, objects, arrays).

A common pattern is to set the image tag to the current commit SHA:

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version $CI_COMMIT_SHA \
    --set image.tag=$CI_COMMIT_SHA
```

For environment-specific overrides, use `--values-file`:

```sh
dag-deploy ./charts/my-app \
    --server https://dag.example.com \
    --deploy-version $CI_COMMIT_SHA \
    --values-file values-production.yaml \
    --set image.tag=$CI_COMMIT_SHA
```

## Chart Structure

DAG extracts the chart to the `iacPath` configured in the App Environment. A typical IAC repo layout after DAG pushes a chart:

```
clusters/
  production/
    my-app/           ← iacPath: clusters/production/my-app
      Chart.yaml
      values.yaml
      templates/
        deployment.yaml
        service.yaml
```

The entire contents of the chart replace whatever was previously at that path.
