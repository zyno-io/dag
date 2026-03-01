#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { setNestedValue } from './yaml-utils.js';

function collectKeyValue(val: string, acc: string[]): string[] {
    acc.push(val);
    return acc;
}

const program = new Command();

program
    .name('dag-inject-values')
    .description('Inject values into YAML files')
    .version('0.0.1')
    .argument('<values-file>', 'Path to YAML file')
    .option('--set <key=value>', 'Set a dotted path to a literal string value (repeatable)', collectKeyValue, [])
    .option('--set-file <key=filepath>', 'Set a dotted path to the contents of a file (repeatable)', collectKeyValue, [])
    .action(async (valuesFile: string, options: { set: string[]; setFile: string[] }) => {
        if (!fs.existsSync(valuesFile)) {
            console.error(`File not found: ${valuesFile}`);
            process.exit(1);
        }

        const content = fs.readFileSync(valuesFile, 'utf-8');
        const loaded = yaml.load(content);
        const doc: Record<string, unknown> =
            loaded !== null && typeof loaded === 'object' && !Array.isArray(loaded) ? (loaded as Record<string, unknown>) : {};

        for (const entry of options.set) {
            const eqIdx = entry.indexOf('=');
            if (eqIdx === -1) {
                console.error(`Invalid --set format: ${entry} (expected key=value)`);
                process.exit(1);
            }
            const key = entry.substring(0, eqIdx);
            const value = entry.substring(eqIdx + 1);
            setNestedValue(doc, key, value);
        }

        for (const entry of options.setFile) {
            const eqIdx = entry.indexOf('=');
            if (eqIdx === -1) {
                console.error(`Invalid --set-file format: ${entry} (expected key=filepath)`);
                process.exit(1);
            }
            const key = entry.substring(0, eqIdx);
            const filePath = entry.substring(eqIdx + 1);
            if (!fs.existsSync(filePath)) {
                console.error(`File not found for --set-file: ${filePath}`);
                process.exit(1);
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            setNestedValue(doc, key, fileContent);
        }

        const output = yaml.dump(doc, { lineWidth: -1 });
        fs.writeFileSync(valuesFile, output, 'utf-8');
    });

program.parse();
