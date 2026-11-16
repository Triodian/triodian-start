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
// Time claims on an Access token (penetration test 16 Nov 2026, hardening item): a correctly signed token with a future
// nbf was accepted. Signs tokens with a local key and stubs the Access certificate endpoint.
{
  const { identify } = await import('../lib/identity/cloudflare-access.js');
  const TEAM = 'acme.cloudflareaccess.com', AUD = 'aud-test';
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k-nbf' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => String(u).includes('/cdn-cgi/access/certs') ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(u, o);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const token = async claims => { const h = b64({ alg: 'RS256', kid: 'k-nbf' }), p = b64({ aud: [AUD], iss: 'https://' + TEAM, exp: now + 600, email: 'cro@acme.test', ...claims });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(h + '.' + p)); return h + '.' + p + '.' + Buffer.from(sig).toString('base64url'); };
  const who = async claims => identify(new Request('https://start.acme.example/auth/email', { headers: { 'Cf-Access-Jwt-Assertion': await token(claims) } }), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
  ok('a valid signed token is accepted (control)', (await who({})).email === 'cro@acme.test');
  ok('a token with nbf in the past is accepted', (await who({ nbf: now - 30 })).email === 'cro@acme.test');
  ok('a token with nbf a few seconds ahead is accepted (clock tolerance)', (await who({ nbf: now + 30 })).email === 'cro@acme.test');
  ok('a correctly signed token with nbf in the future is refused', (await who({ nbf: now + 3600 })).status === 401);
  ok('a token issued in the future is refused', (await who({ iat: now + 3600 })).status === 401);
  ok('a token with a non-numeric nbf is refused', (await who({ nbf: 'soon' })).status === 401);
  ok('an expired token is still refused', (await who({ exp: now - 10 })).status === 401);
  globalThis.fetch = realFetch;
}

console.log(fails ? `\n${fails} failed` : '\nAll passed'); process.exit(fails ? 1 : 0);
