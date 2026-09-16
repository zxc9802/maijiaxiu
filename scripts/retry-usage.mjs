import nextEnv from '@next/env';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { drainUsageOutbox } from '../lib/buyer-show/usage-monitor.ts';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MAIN_APP_URL || !process.env.USAGE_MONITOR_INTERNAL_SECRET) {
  throw new Error('MAIN_APP_URL and USAGE_MONITOR_INTERNAL_SECRET are required');
}
await drainUsageOutbox();
const directory = process.env.USAGE_MONITOR_OUTBOX_DIR || join(process.cwd(), 'data', 'usage-outbox');
const files = await readdir(directory).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
console.log(`Usage retry batch finished; ${files.filter(f => f.endsWith('.json')).length} events remain.`);
