// The Node platform for Start (development plan ID.3): the same handler as the Cloudflare Worker, run by node:http with
// SQLite. The engagement apps carry the fuller test of the shared files (their tests/platform.test.mjs); this one starts
// Start itself. Run: node tests/platform.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { sqliteDatabase } from '../lib/store/sqlite.js';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' → ' + extra : '')); };
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

{
  const db = sqliteDatabase(':memory:');
  await db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL UNIQUE)').run();
  let threw = false;
  try { await db.batch([db.prepare('INSERT INTO t (v) VALUES (?)').bind('a'), db.prepare('INSERT INTO t (v) VALUES (?)').bind('a')]); } catch (e) { threw = true; }
  ok('the SQLite adapter’s batch is one transaction', threw && (await db.prepare('SELECT count(*) AS n FROM t').first()).n === 0);
  db.close();
}

{
  const port = await freePort(), dir = mkdtempSync(join(tmpdir(), 'triodian-start-platform-'));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, 'src/node.js')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir, SITE_URL: base, LOCAL_DEV_NO_SIGNIN_EMAIL: 'admin@acme.test', ADMINS: 'admin@acme.test',
      NOTIFY_SENDING: 'off', SUITE_DEMO: 'off', SITE_LABEL: 'Node test', APP_COMMIT: 'test-commit', ATLAS_URL: 'http://127.0.0.1:9/' },
  });
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  const up = async () => { for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {} await new Promise(r => setTimeout(r, 100)); } return false; };
  try {
    ok('src/node.js starts and answers /api/version', await up(), log.slice(-400));
    const v = await (await fetch(base + '/api/version')).json();
    ok('with the app id and the commit it was started with', v.app === 'start' && v.commit === 'test-commit', JSON.stringify(v));
    const home = await fetch(base + '/');
    ok('the home page is served from public/', home.status === 200 && /text\/html/.test(home.headers.get('content-type')) && home.headers.get('x-triodian-release') === 'test-commit');
    const other = await fetch(base + '/api/admin/prospects', { headers: { 'X-Dev-User': 'nobody@acme.test' } });
    ok('the administrator rules run: someone not in ADMINS is refused', other.status === 403, String(other.status));
    const mine = await fetch(base + '/api/admin/prospects', { headers: { 'X-Dev-User': 'admin@acme.test' } });
    ok('the administrator reads the prospects through the SQLite store', mine.status === 200, String(mine.status) + ' ' + (await mine.text()).slice(0, 120));
    const lo = await fetch(base + '/auth/logout', { redirect: 'manual' });
    ok('the auth routes run (sign-out redirects home)', lo.status === 303, `${lo.status} ${lo.headers.get('location')}`);
  } finally {
    child.kill();
    await new Promise(r => child.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(fails ? `\n${fails} failed` : '\nAll passed'); process.exit(fails ? 1 : 0);
