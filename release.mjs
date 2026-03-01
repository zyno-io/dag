#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkgJsonPath = join(rootDir, 'package.json');
const chartYamlPath = join(rootDir, 'charts/dag/Chart.yaml');

const arg = process.argv[2];
if (!arg) {
    console.error('Usage: node release.mjs <major|minor|patch|x.y.z>');
    console.error('');
    console.error('Examples:');
    console.error('  node release.mjs patch      # 0.0.1 → 0.0.2');
    console.error('  node release.mjs minor      # 0.0.1 → 0.1.0');
    console.error('  node release.mjs major      # 0.0.1 → 1.0.0');
    console.error('  node release.mjs 1.2.3      # set explicit version');
    process.exit(1);
}

function bumpVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    switch (type) {
        case 'major': return `${major + 1}.0.0`;
        case 'minor': return `${major}.${minor + 1}.0`;
        case 'patch': return `${major}.${minor}.${patch + 1}`;
        default: return type; // explicit version
    }
}

// Read current versions
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const chartYaml = readFileSync(chartYamlPath, 'utf8');

const currentVersion = pkgJson.version;
const currentChartVersion = chartYaml.match(/^version:\s*(.+)$/m)[1];

// Compute new versions
const newVersion = bumpVersion(currentVersion, arg);
const newChartVersion = bumpVersion(currentChartVersion, arg);

// Update package.json
pkgJson.version = newVersion;
writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 4) + '\n');

// Update Chart.yaml
const updatedChart = chartYaml
    .replace(/^version:\s*.+$/m, `version: ${newChartVersion}`)
    .replace(/^appVersion:\s*.+$/m, `appVersion: '${newVersion}'`);
writeFileSync(chartYamlPath, updatedChart);

console.log(`Bumped version: ${currentVersion} → ${newVersion}`);
console.log(`Bumped chart version: ${currentChartVersion} → ${newChartVersion}`);
console.log('');
console.log('Updated files:');
console.log('  - package.json');
console.log('  - charts/dag/Chart.yaml (version + appVersion)');
