#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('$ROOT_DIR/package.json').version")

echo "Syncing version $VERSION across all packages..."

for pkg in shared server cli; do
    PKG_JSON="$ROOT_DIR/packages/$pkg/package.json"
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('$PKG_JSON', JSON.stringify(pkg, null, 4) + '\n');
    "
    echo "  packages/$pkg/package.json -> $VERSION"
done

CHART_YAML="$ROOT_DIR/charts/dag/Chart.yaml"
sed -i.bak "s/^version: .*/version: $VERSION/" "$CHART_YAML"
sed -i.bak "s/^appVersion: .*/appVersion: '$VERSION'/" "$CHART_YAML"
rm -f "$CHART_YAML.bak"
echo "  charts/dag/Chart.yaml -> $VERSION"

echo "Done."
