#!/usr/bin/env node
import { createServer } from './server.js';

async function main() {
  try {
    await createServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});