# dag-inject-values

Modify a YAML values file by setting keys to literal values or file contents. Useful for injecting dynamic values (image tags, config files) into Helm chart values before deploying.

## Usage

```sh
dag-inject-values <values-file> [options]
```

### Arguments

| Argument        | Description                     |
| --------------- | ------------------------------- |
| `<values-file>` | Path to the YAML file to modify |

### Options

| Option                      | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `--set <key=value>`         | Set a dotted path to a literal string value (repeatable) |
| `--set-file <key=filepath>` | Set a dotted path to the contents of a file (repeatable) |

Both options can be specified multiple times. Keys use dotted path notation to target nested YAML fields.

## Examples

Set the image tag:

```sh
dag-inject-values values.yaml --set image.tag=v1.2.3
```

Set multiple values:

```sh
dag-inject-values values.yaml \
    --set image.tag=v1.2.3 \
    --set replicas=3
```

Inject a config file:

```sh
dag-inject-values values.yaml \
    --set-file config.json=/path/to/config.json
```

### Before and After

Given `values.yaml`:

```yaml
image:
  repository: my-app
  tag: latest
replicas: 1
```

After running:

```sh
dag-inject-values values.yaml --set image.tag=v1.2.3 --set replicas=3
```

Result:

```yaml
image:
  repository: my-app
  tag: v1.2.3
replicas: '3'
```

::: tip
All values set via `--set` are stored as strings. If you need typed values (numbers, booleans), edit the YAML file directly or use `--set-file` with a YAML snippet.
:::
