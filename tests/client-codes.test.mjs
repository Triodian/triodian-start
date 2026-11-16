// One client per code (penetration test 16 Nov 2026, PT-06; development plan P.6). The approval used to check the code
// against the newest 500 prospects only, and the database had no uniqueness constraint, so a code held by an older
// client could be approved again. Runs the real API against the real D1 store on SQLite, with 502 prospects, as the
// penetration test did.  Run: node tests/client-codes.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { handle, atlasClient } from '../lib/core/api.js';
import { d1Store } from '../lib/store/d1.js';
import { stubFetch } from './atlas/stub.mjs';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' → ' + extra : '')); };
function d1(sql) {
  const stmt = (q, args = []) => ({ bind: (...a) => stmt(q, a),
    async run() { const r = sql.prepare(q).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    async first() { return sql.prepare(q).get(...args) || null; }, async all() { return { results: sql.prepare(q).all(...args) }; } });
  return { prepare: q => stmt(q), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}
const ADMIN = 'ops@triodian.com', P = (name, email) => ({ name, email }), T = name => P(name, name.toLowerCase().replace(/\W+/g, '.') + '@triodian.com');
const deliveries = {}; const delivery = email => deliveries[email];
const fresh = async () => { const sql = new DatabaseSync(':memory:'), store = d1Store(d1(sql)); await store.init(); return { sql, store, call: (method, path, email, body) => handle({ method, path, email, body, admins: [ADMIN], sender: null }, store, atlasClient(stubFetch, 'https://obligations-atlas.triodian.com')) }; };
/** A prospect with a Board Direction engagement and a complete team, asked to start. */
async function ready(call, email, org) {
  await call('PUT', '/api/profile', email, { name: 'Lead', organisation: org, answers: { role: 'directorOrChair', jurisdiction: 'AU', entityType: 'privateCompany', size: 'small' } });
  await call('PUT', '/api/run-by', email, { mode: 'self' });
  const t = await call('GET', '/api/team', email);
  const need = {}, del = {}; for (const e of t.body.engagements) for (const role of e.roles.filter(x => x.min > 0)) {
    if (role.side === 'client') (need[e.assessmentType] = need[e.assessmentType] || {})[role.id] = [P(role.name, role.id + '@' + org.toLowerCase().replace(/\W+/g, '') + '.example')];
    else (del[e.assessmentType] = del[e.assessmentType] || {})[role.id] = [T(role.name + ' ' + role.id)];
  }
  deliveries[email] = { assign: del };
  await call('PUT', '/api/team', email, { assign: need });
  const r = await call('POST', '/api/team/start', email);
  if (!(r.status === 200 && r.body.started)) throw new Error('fixture: could not ask to start: ' + JSON.stringify(r.body));
}

{
  const { sql, store, call } = await fresh();
  // the oldest prospect holds the code "harbour"; 501 newer ones push it outside the newest 500
  await ready(call, 'old@harbour.example', 'Harbour Pty');
  const oldest = await store.prospectByEmail('old@harbour.example');
  let r = await call('PUT', `/api/admin/requests/${oldest.id}/approve`, ADMIN, { code: 'harbour', admin: 'old@harbour.example', delivery: delivery('old@harbour.example') });
  ok('the oldest client is approved with the code harbour', r.status === 200 && (await store.prospectByEmail('old@harbour.example')).clientCode === 'harbour');
  sql.exec(`UPDATE prospects SET created_at = '2026-01-01T00:00:00Z' WHERE email = 'old@harbour.example'`);
  const ins = sql.prepare(`INSERT INTO prospects (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)`);
  for (let i = 0; i < 500; i++) ins.run('p' + i, `p${i}@filler.example`, `2026-06-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`, '2026-06-01T00:00:00Z');
  ok('the oldest client is outside the newest 500 the admin list shows', !(await store.listProspects()).some(p => p.email === 'old@harbour.example') && (await store.listProspects()).length === 500);
  await ready(call, 'new@other.example', 'Other Co');
  const newer = await store.prospectByEmail('new@other.example');
  r = await call('PUT', `/api/admin/requests/${newer.id}/approve`, ADMIN, { code: 'harbour', admin: 'new@other.example', delivery: delivery('new@other.example') });
  const holders = sql.prepare(`SELECT email FROM prospects WHERE client_code = 'harbour'`).all().map(x => x.email);
  ok('approving a second client with the code harbour is refused', r.status === 409 && r.body.code === 'code_taken' && /already used/.test(r.body.error), `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  ok('and the database holds one client with that code', holders.length === 1 && holders[0] === 'old@harbour.example', holders.join());
  ok('the newer request is still waiting, not approved', (await store.prospectByEmail('new@other.example')).status === 'team_ready');
  r = await call('PUT', `/api/admin/requests/${newer.id}/approve`, ADMIN, { code: 'other', admin: 'new@other.example', delivery: delivery('new@other.example') });
  ok('with a free code it is approved (control)', r.status === 200 && (await store.prospectByEmail('new@other.example')).clientCode === 'other');
  ok('the code is found by exact lookup', (await store.prospectByClientCode('harbour')).email === 'old@harbour.example' && (await store.prospectByClientCode('harb')) === null);
  // the database itself refuses a second row with the same code, whatever the application does
  let threw = ''; try { sql.exec(`UPDATE prospects SET client_code = 'harbour' WHERE email = 'p1@filler.example'`); } catch (e) { threw = e.message; }
  ok('the unique index refuses a duplicate code at the database', /UNIQUE/i.test(threw), threw);
  // two approvals of the same free code at once: one wins
  await ready(call, 'a@race.example', 'Race A'); await ready(call, 'b@race.example', 'Race B');
  const [ra, rb] = await Promise.all([
    call('PUT', `/api/admin/requests/${(await store.prospectByEmail('a@race.example')).id}/approve`, ADMIN, { code: 'race', admin: 'a@race.example', delivery: delivery('a@race.example') }),
    call('PUT', `/api/admin/requests/${(await store.prospectByEmail('b@race.example')).id}/approve`, ADMIN, { code: 'race', admin: 'b@race.example', delivery: delivery('b@race.example') })]);
  const raceHolders = sql.prepare(`SELECT email FROM prospects WHERE client_code = 'race'`).all();
  ok('two approvals of the same code at once leave one holder', raceHolders.length === 1 && [ra.status, rb.status].sort().join() === '200,409', `${ra.status} ${rb.status} holders=${raceHolders.length}`);
}
{
  // duplicates from before the index: the store notices and approvals pause until they are resolved
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE prospects (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', organisation TEXT NOT NULL DEFAULT '', answers TEXT NOT NULL DEFAULT '{}', solution TEXT, status TEXT NOT NULL DEFAULT 'prospect', client_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  sql.exec(`INSERT INTO prospects (id, email, client_code, status, created_at, updated_at) VALUES ('d1', 'one@dup.example', 'dup', 'approved', 'x', 'x'), ('d2', 'two@dup.example', 'dup', 'approved', 'x', 'x')`);
  const store = d1Store(d1(sql)); await store.init();
  ok('a database with duplicate codes is noticed at start, not hidden', Array.isArray(store.duplicateCodes) && store.duplicateCodes.join() === 'dup');
  const r = await store.claimClientCode('one@dup.example', {}, 'approved', 'fresh', 'x');
  ok('approvals are paused while duplicates exist, naming them', r.conflict === true && r.duplicates.join() === 'dup');
}
console.log(fails ? `\n${fails} failed` : '\nAll passed'); process.exit(fails ? 1 : 0);
