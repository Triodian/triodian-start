// Who administers Triodian Start (penetration test 16 Nov 2026, PT-01; development plan P.1). Administrators come only
// from the deployment's ADMINS variable: none are compiled in, so a deployment can change or revoke them without a
// code change, and a site with none set has no administrator. Runs the real Worker entry point against SQLite through
// a small D1 shim, as the penetration test did.  Run: node tests/admins.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import * as w from '../src/worker.js';
const worker = w.default, adminsOf = w.adminsOf || (() => []); // adminsOf arrived with the fix; without it the Worker checks below show the defect
import * as config from '../lib/config.js';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' → ' + extra : '')); };
function d1(sql) {
  const stmt = (q, args = []) => ({ bind: (...a) => stmt(q, a),
    async run() { const r = sql.prepare(q).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    async first() { return sql.prepare(q).get(...args) || null; }, async all() { return { results: sql.prepare(q).all(...args) }; } });
  return { prepare: q => stmt(q), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

// nothing compiled in
ok('lib/config.js exports no administrator list', !('BOOTSTRAP_ADMINS' in config) && !Object.values(config).some(v => Array.isArray(v) && v.some(x => /@/.test(String(x)))));
ok('the source names no administrator address', !/BOOTSTRAP_ADMINS|damian\.hickey@/.test(readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8') + readFileSync(new URL('../lib/config.js', import.meta.url), 'utf8')));
ok('ADMINS unset means no administrator', adminsOf({}).length === 0 && adminsOf({ ADMINS: '' }).length === 0 && adminsOf({ ADMINS: ' , ' }).length === 0);
ok('ADMINS is read as a comma-separated list, case-folded', adminsOf({ ADMINS: ' Ana@Coastline.example, ben@harrow.example ' }).join() === 'ana@coastline.example,ben@harrow.example');

// through the real Worker, with real SQLite: the built-in address of the old source is an ordinary prospect now
const BUILT_IN = 'damian.hickey@triodian.com', CLIENT_ADMIN = 'admin@coastline.example', OUTSIDER = 'ana@coastline.example';
const env = (admins) => ({ DB: d1(new DatabaseSync(':memory:')), ADMINS: admins, LOCAL_DEV_NO_SIGNIN_EMAIL: OUTSIDER, ATLAS_URL: 'http://localhost:1', ASSETS: { fetch: () => new Response('') } });
const as = (e, who, path = '/api/admin/prospects') => worker.fetch(new Request('http://localhost:8788' + path, { headers: { 'X-Dev-User': who, Accept: 'application/json' } }), e, { waitUntil() {} });
{
  const e = env(CLIENT_ADMIN);
  const a = await as(e, CLIENT_ADMIN), b = await as(e, BUILT_IN), c = await as(e, OUTSIDER);
  ok('with ADMINS set to the client’s administrator, that address lists the sign-ups', a.status === 200 && Array.isArray((await a.json()).prospects), String(a.status));
  ok('the address the old source compiled in gets 403 like anyone else', b.status === 403, String(b.status));
  ok('an outsider gets 403', c.status === 403, String(c.status));
  for (const p of ['/api/admin/requests', '/api/admin/marketing']) ok(`${p} is closed to the old built-in address too`, (await as(e, BUILT_IN, p)).status === 403);
}
{
  const e = env('');
  const r = await as(e, BUILT_IN);
  const body = await r.json();
  ok('with ADMINS empty nobody is an administrator, and the reason is said', r.status === 403 && /No administrator is configured/.test(body.error || ''), `${r.status} ${body.error}`);
  const me = await as(e, BUILT_IN, '/api/me');
  ok('and the site still works for prospects (fails closed, not down)', me.status === 200 && (await me.json()).isAdmin === false);
}
console.log(fails ? `\n${fails} failed` : '\nAll passed'); process.exit(fails ? 1 : 0);
