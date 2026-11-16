// Node entry point for Triodian Start (development plan ID.3): the same handler as the Cloudflare Worker, run by
// node:http with SQLite (lib/platform/node.js). Run: node src/node.js  (PORT, DATA_DIR, SITE_URL, ADMINS, ATLAS_URL and
// the Worker's other variables from the environment).
import worker from './worker.js';
import { nodeEnv, serve, daily } from '../lib/platform/node.js';

const env = await nodeEnv(process.env, { appId: 'start', publicDir: new URL('../public', import.meta.url).pathname });
const server = await serve(worker, env);
daily(worker, env);
const a = server.address();
console.log(`Triodian Start listening on http://${a.address}:${a.port} (data in ${env.DATA_DIR || '.data'})`);
