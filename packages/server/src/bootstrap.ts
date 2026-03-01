#!/usr/bin/env npx ts-node

// otel must be initialized before all else

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@zyno-io/dk-server-foundation/telemetry/otel/index.js').init();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('./app.js');
const app = createApp();
app.run();
