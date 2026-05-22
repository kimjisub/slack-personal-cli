#!/usr/bin/env node

import { runCli } from './slk.js';

try {
  await runCli();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
