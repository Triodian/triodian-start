// Cloudflare Worker entry point for Triodian Start, the front door to the Triodian AI governance apps (development
// plan phase 5). Static files in /public are served by Cloudflare; requests to /api/* come here.
// The app logic is in lib/core (cloud-neutral); this file only connects it to Cloudflare:
//   identity → lib/identity/session.js (the /login page and sessions; Cloudflare Access guards /auth/email only,
//              with a policy that lets anyone with an email address sign in by one-time PIN: open sign-up)
//   storage  → lib/store/d1.js (Cloudflare D1): prospects only
//   Atlas    → the ATLAS service binding to the Atlas Worker when set, else ATLAS_URL, for the routing table (task 5.3)
import { whoIs, handleAuth, gate, markDemo } from '../lib/identity/session.js';
import { d1Store } from '../lib/store/d1.js';
import { handle, atlasClient } from '../lib/core/api.js';
import { ATLAS_URL, BOOTSTRAP_ADMINS } from '../lib/config.js';
import { tryFirst, tryFirstOn } from '../lib/identity/try-first.js';
import { methodsOn, asEmailSignIn } from '../lib/identity/methods.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

let atlasFor = null;
function atlas(env) {
  if (atlasFor && atlasFor.env === env) return atlasFor.client;
  const fetcher = env.ATLAS && typeof env.ATLAS.fetch === 'function' ? r => env.ATLAS.fetch(r) : r => fetch(r);
  const client = atlasClient(fetcher, env.ATLAS_URL || ATLAS_URL);
  atlasFor = { env, client };
  return client;
}
const admins = env => BOOTSTRAP_ADMINS.concat(String(env.ADMINS || '').split(',').map(x => x.trim()).filter(Boolean));

// The home page (with sign-in) and the assets are open; /start/ (the questions) needs a session.
const OPEN_PAGES = new Set(['/', '/index.html']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Google, a work account, GitHub or Apple: Access has proven the email on that path; start the session as for email.
    const viaProvider = asEmailSignIn(request, env);
    const auth = await handleAuth(viaProvider || request, env);
    if (auth) return auth;
    if (url.pathname === '/auth/methods') return json({ methods: methodsOn(env).map(m => ({ id: m.id, path: m.path, label: m.label })) });
    // Try first (task 5.8): open an app's worked example as the shared demo account, with or without signing up.
    if (url.pathname === '/auth/try') return tryFirst(request, env);
    if (url.pathname === '/auth/try-status') return json({ on: tryFirstOn(env) });
    // Sign-in lives on the home page. session.js (shared with the apps) sends people to /login; send them home with the
    // same message and destination.
    if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return new Response(null, { status: 303, headers: { Location: '/' + url.search, 'Cache-Control': 'no-store' } });
    if (!url.pathname.startsWith('/api/')) {
      if (!OPEN_PAGES.has(url.pathname)) { const g = await gate(request, env); if (g) return g; }
      return markDemo(await env.ASSETS.fetch(request), env);
    }
    if (!env.DB) return json({ error: 'The database is not connected to Triodian Start yet.' }, 503);
    const who = await whoIs(request, env);
    if (!who.email) return json({ error: who.error || 'Sign in with your email to continue.' }, who.status || 401);
    let body;
    if (request.method === 'PUT' || request.method === 'POST') {
      const text = await request.text();
      if (text.length > 64 * 1024) return json({ error: 'The request is too large.' }, 413);
      try { body = text ? JSON.parse(text) : undefined; } catch (e) { return json({ error: 'The request is not valid JSON.' }, 400); }
    }
    try {
      const r = await handle({ method: request.method, path: url.pathname, email: who.email, query: Object.fromEntries(url.searchParams), body, admins: admins(env), tryFirst: tryFirstOn(env) }, d1Store(env.DB), atlas(env));
      if (r.csv != null) return new Response(r.csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="triodian-start-marketing.csv"', 'Cache-Control': 'no-store' } });
      return json(r.body, r.status);
    } catch (e) {
      console.error(e);
      return json({ error: 'The server hit an error. Try again.' }, 500);
    }
  },
};
