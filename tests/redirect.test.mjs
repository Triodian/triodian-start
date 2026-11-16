// The way back after sign-in can only be a page on this site (penetration test 16 Nov 2026, PT-03). Start shares
// lib/identity/session.js with the four engagement apps; the same cases are in their tests/identity.test.mjs.
// Run: node tests/redirect.test.mjs
import { safeNext, handleAuth } from '../lib/identity/session.js';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' → ' + extra : '')); };
const ORIGIN = 'https://start.acme.example';
for (const bad of ['/\\attacker.example/landing', '//attacker.example', '/\\/attacker.example', '/%5Cattacker.example', '/%2F%2Fattacker.example', 'https://attacker.example/',
  'javascript:alert(1)', '/x\u0000y', '/login', '/auth/email', '', null]) {
  ok(`next=${JSON.stringify(bad)} is refused and lands on /`, safeNext(bad, ORIGIN) === '/', safeNext(bad, ORIGIN));
}
for (const good of ['/start/', '/start/journey?step=2#team', '/']) ok(`next=${good} still lands there`, safeNext(good, ORIGIN) === good, safeNext(good, ORIGIN));

// through the real email sign-in on a local Worker: the session starts and the redirect stays on this site
const sessions = new Map();
const DB = { prepare(sql) { let args = []; return { bind(...a) { args = a; return this; },
  async run() { if (/^INSERT INTO sessions/.test(sql)) sessions.set(args[0], { email: args[1] }); return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; } };
const env = { DB, LOCAL_DEV_NO_SIGNIN_EMAIL: 'ana@coastline.example', ACCESS_TEAM_DOMAIN: '' };
for (const [next, want] of [['/\\attacker.example/landing', '/'], ['//attacker.example', '/'], ['/start/journey?step=2', '/start/journey?step=2']]) {
  const res = await handleAuth(new Request(`http://localhost:8788/auth/email?next=${encodeURIComponent(next)}`), env);
  const loc = res.headers.get('Location') || '';
  ok(`/auth/email?next=${next} → ${want}`, res.status === 303 && loc === want && new URL(loc, 'http://localhost:8788').origin === 'http://localhost:8788', `${res.status} ${loc}`);
}
console.log(fails ? `\n${fails} failed` : '\nAll passed'); process.exit(fails ? 1 : 0);
