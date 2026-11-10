// Try first (development plan task 5.8): a visitor opens an app's worked example without signing up or forming a team.
// The demo sites already let the shared demo account in (lib/identity/session.js, the tri_demo cookie for the whole
// triodian.com domain, signed with DEMO_SESSION_KEY). Start signs the same cookie for that account, so the worked
// example opens in the app without the demo password. The cookie names only the demo account, never the visitor, and
// the apps accept it only for the account in their own DEMO_LOGIN, so it can't act as anyone else.
// This writes the token in the same format as session.js (kept identical across the apps, so it is not changed here).

const DEMO_COOKIE = 'tri_demo';
const DEMO_HOURS = 12;
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The demo cookie's value for this email, as session.js reads it. */
export async function demoTokenFor(key, email, exp) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64u(enc.encode(JSON.stringify({ e: email, x: exp })));
  return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
}

/** Try first is on only on the demo sites: SUITE_DEMO on and DEMO_SESSION_KEY set. */
export const tryFirstOn = env => String(env.SUITE_DEMO || '').trim().toLowerCase() === 'on' && !!env.DEMO_SESSION_KEY;

/** The app hosts the worked examples open on, keyed by the routing table's engagement ids. */
export const APP_HOSTS = { aiBoardDirection: 'board-direction', aiRiskAppetite: 'risk-appetite', aiUseAssessment: 'use-assessment', aiConfidentialityExposureAssessment: 'confidentiality' };

/**
 * GET /auth/try?app=<engagement id>, open to any visitor: no sign-up is needed to look at a worked example. Returns a
 * Response: a redirect to the app's worked example with the demo cookie set, or back to where the visitor came from
 * with the reason it can't (`from`: "start" for the signed-in page, else the landing page).
 */
export async function tryFirst(request, env) {
  const url = new URL(request.url);
  const home = url.searchParams.get('from') === 'start' ? '/start/' : '/';
  const back = msg => new Response(null, { status: 303, headers: { Location: home + '?try=' + encodeURIComponent(msg), 'Cache-Control': 'no-store' } });
  if (!tryFirstOn(env)) return back('off');
  const host = APP_HOSTS[url.searchParams.get('app') || ''];
  if (!host) return back('unknown');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const parent = String(env.SUITE_COOKIE_DOMAIN || 'triodian.com').replace(/^\./, '');
  const exp = Math.floor(Date.now() / 1000) + DEMO_HOURS * 3600;
  const token = await demoTokenFor(env.DEMO_SESSION_KEY, String(env.DEMO_EMAIL || 'demo@triodian.com').toLowerCase(), exp);
  const to = env.TRY_BASE_URL ? `${env.TRY_BASE_URL.replace(/\/$/, '')}/${host}/` : `https://${host}${env.APP_HOST_SUFFIX || ''}.${parent}/?suite=1`;
  return new Response(null, { status: 303, headers: {
    Location: to, 'Cache-Control': 'no-store',
    'Set-Cookie': `${DEMO_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEMO_HOURS * 3600}${local ? '' : '; Secure; Domain=' + parent}`,
  } });
}
