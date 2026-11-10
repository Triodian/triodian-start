// Triodian Start's API (development plan tasks 5.1, 5.2 and 5.8), against a stand-in Atlas built from the Atlas's own
// core (tests/atlas). Run: node tests/api.test.mjs
import { handle, answersError, atlasClient } from '../lib/core/api.js';
import { memoryStore } from '../lib/store/d1.js';
import { stubFetch, table } from './atlas/stub.mjs';
import { demoTokenFor, tryFirst, tryFirstOn } from '../lib/identity/try-first.js';
import { sessionEmail } from '../lib/identity/session.js';
import { methodsOn, asEmailSignIn } from '../lib/identity/methods.js';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' → ' + extra : '')); };
const store = memoryStore(), atlas = atlasClient(stubFetch, 'https://obligations-atlas.triodian.com');
const call = (method, path, email, extra = {}) => handle({ method, path, email, admins: ['damian.hickey@triodian.com'], ...extra }, store, atlas);

let r = await call('GET', '/api/me', '');
ok('without a proven email nothing answers', r.status === 401);
r = await call('GET', '/api/me', 'Ana@Coastline.example');
ok('the first sign-in adds a prospect (sign-up)', r.status === 200 && r.body.prospect.status === 'prospect' && r.body.prospect.email === 'ana@coastline.example', JSON.stringify(r.body));
ok('the sign-up is in the audit log', store._audit.some(x => x.action === 'prospect.signup' && x.actor === 'ana@coastline.example'));
r = await call('GET', '/api/me', 'ana@coastline.example');
ok('signing in again keeps the same prospect', (await store.listProspects()).length === 1);

for (const p of ['/api/team', '/api/journey', '/api/engagement/x']) {
  r = await call('GET', p, 'ana@coastline.example');
  ok(`nothing else is reachable until provisioned: ${p}`, r.status === 403 && r.body.code === 'not_provisioned');
}
r = await call('GET', '/api/admin/prospects', 'ana@coastline.example');
ok('a prospect cannot see the other sign-ups', r.status === 403);
r = await call('GET', '/api/admin/prospects', 'damian.hickey@triodian.com');
ok('a Triodian administrator can', r.status === 200 && r.body.prospects.length === 2);

r = await call('GET', '/api/table', 'ana@coastline.example');
ok('the routing table comes from the Atlas', r.status === 200 && r.body.format === 'triodian.routingTable/1' && r.body.roles.length === 7);
const T = table();
ok('answers are checked against the table', answersError({ role: 'croOrRisk', jurisdiction: 'AU', sector: 'AU-SUPERANNUATION' }, T) === null
  && /Unknown role/.test(answersError({ role: 'x' }, T)) && /not in SG/.test(answersError({ jurisdiction: 'SG', sector: 'AU-SUPERANNUATION' }, T))
  && /not both/.test(answersError({ sector: 'AU-SUPERANNUATION', entityType: 'privateCompany' }, T)) && /Unknown answer/.test(answersError({ colour: 'red' }, T)));

r = await call('GET', '/api/solution-set', 'ana@coastline.example', { query: { role: 'croOrRisk', jurisdiction: 'AU', sector: 'AU-SUPERANNUATION', size: 'medium', prompt: 'apraLetter' } });
ok('a super trustee CRO prompted by the APRA letter: Board Direction connected, then Risk Appetite, then Use Assessment in Lite scope',
  r.status === 200 && r.body.engagements.map(e => e.assessmentType).join() === 'aiBoardDirection,aiRiskAppetite,aiUseAssessment' && r.body.engagements[0].mode === 'connected' && r.body.engagements[2].scope === 'lite' && r.body.engagements[0].yourPart === 'cro', JSON.stringify(r.body).slice(0, 300));
r = await call('GET', '/api/solution-set', 'ana@coastline.example', { query: { role: 'boardAdvisor', jurisdiction: 'AU', entityType: 'privateCompany', prompt: 'deal' } });
ok('a private company with a deal: standalone Board Direction, then the confidentiality assessment, starting there', r.status === 200 && r.body.engagements[1].startHere && r.body.engagements[0].mode === 'standalone');
r = await call('GET', '/api/solution-set', 'ana@coastline.example', { query: { role: 'nobody' } });
ok('an unknown answer is refused with the reason', r.status === 400 && /Unknown role/.test(r.body.error));

r = await call('PUT', '/api/profile', 'ana@coastline.example', { body: { name: 'Ana Cruz', organisation: 'Coastline Super', answers: { role: 'croOrRisk', jurisdiction: 'AU', sector: 'AU-SUPERANNUATION', size: 'large', prompt: 'apraLetter' } } });
ok('the answers save with the solution set shown', r.status === 200 && r.body.prospect.name === 'Ana Cruz' && r.body.prospect.solution.engagements.length === 3 && r.body.prospect.solution.engagements[2].scope === 'full');
ok('the saved brief link is scoped to the answers', /#\/brief\/.*AU-SUPERANNUATION/.test(decodeURIComponent(r.body.prospect.solution.matterBrief.url)));
r = await call('PUT', '/api/profile', 'ana@coastline.example', { body: { answers: { role: 'croOrRisk', sector: 'AU-NOWHERE' } } });
ok('an answer not in the table is not saved', r.status === 400 && (await store.prospectByEmail('ana@coastline.example')).answers.sector === 'AU-SUPERANNUATION');
r = await call('PUT', '/api/profile', 'ana@coastline.example', { body: { name: 'x'.repeat(121), answers: {} } });
ok('a name over 120 characters is refused', r.status === 400);

const down = atlasClient(async () => { throw new Error('down'); }, 'https://atlas.invalid');
r = await handle({ method: 'GET', path: '/api/table', email: 'ana@coastline.example' }, store, down);
ok('when the Atlas is down the answer says so', r.status === 502 && r.body.code === 'atlas');

// Marketing email: opt-in only, recorded with its wording and date, and withdrawable (task 5.1)
r = await call('GET', '/api/me', 'ana@coastline.example');
ok('nobody is opted in by signing up', r.body.prospect.marketing === null && /stop them at any time/.test(r.body.marketingWording));
r = await call('PUT', '/api/marketing', 'ana@coastline.example', { body: { consent: 'yes' } });
ok('the choice is a yes or a no', r.status === 400);
r = await call('PUT', '/api/marketing', 'ana@coastline.example', { body: { consent: true } });
ok('opting in keeps what was agreed to and when', r.status === 200 && r.body.prospect.marketing.consent === true && r.body.prospect.marketing.wording.startsWith('Send me news') && !!r.body.prospect.marketing.version);
await call('GET', '/api/me', '=cmd@evil.example');
await call('PUT', '/api/marketing', '=cmd@evil.example', { body: { consent: true } });
r = await call('GET', '/api/admin/marketing', 'damian.hickey@triodian.com');
ok('the administrator sees who opted in', r.status === 200 && r.body.people.map(p => p.email).sort().join() === '=cmd@evil.example,ana@coastline.example');
r = await call('GET', '/api/admin/marketing', 'damian.hickey@triodian.com', { query: { format: 'csv' } });
ok('as a CSV for the mailing tool, with formula-like cells made harmless', r.csv.startsWith('email,name,organisation,consented_at,wording_version\n') && r.csv.includes("'=cmd@evil.example") && r.csv.includes('ana@coastline.example'), r.csv);
r = await call('GET', '/api/admin/marketing', 'ana@coastline.example');
ok('a prospect cannot see the marketing list', r.status === 403);
r = await call('PUT', '/api/marketing', 'ana@coastline.example', { body: { consent: false } });
ok('opting out records the withdrawal of the earlier consent', r.body.prospect.marketing.consent === false && !!r.body.prospect.marketing.withdrawnFrom);
r = await call('GET', '/api/admin/marketing', 'damian.hickey@triodian.com');
ok('and takes the person off the list', !r.body.people.some(p => p.email === 'ana@coastline.example'));
ok('both choices are in the audit log', store._audit.some(x => x.action === 'marketing.optIn') && store._audit.some(x => x.action === 'marketing.optOut'));

// Ways to sign in (task 5.1)
ok('email alone when none are listed', methodsOn({}).map(m => m.id).join() === 'email');
ok('the listed methods, in button order', methodsOn({ SIGN_IN_METHODS: 'email, Apple,google,microsoft,github,myspace' }).map(m => m.id).join() === 'google,microsoft,github,apple,email');
const via = asEmailSignIn(new Request('https://start.triodian.com/auth/google?next=%2Fstart%2F', { headers: { 'Cf-Access-Jwt-Assertion': 'x.y.z' } }), { SIGN_IN_METHODS: 'google,email' });
ok('a provider path is handed to the email sign-in, keeping the Access token and next', via && new URL(via.url).pathname === '/auth/email' && new URL(via.url).searchParams.get('next') === '/start/' && via.headers.get('Cf-Access-Jwt-Assertion') === 'x.y.z');
ok('a method not set up on the site is not', asEmailSignIn(new Request('https://start.triodian.com/auth/github'), { SIGN_IN_METHODS: 'google,email' }) === null);

// Try first (task 5.8)
const env = { SUITE_DEMO: 'on', DEMO_SESSION_KEY: 'k'.repeat(32) };
ok('try first is on only on a demo site with the demo key', tryFirstOn(env) && !tryFirstOn({ SUITE_DEMO: 'off', DEMO_SESSION_KEY: 'k' }) && !tryFirstOn({ SUITE_DEMO: 'on' }));
let res = await tryFirst(new Request('https://start.triodian.com/auth/try?app=aiRiskAppetite'), env);
const cookie = res.headers.get('set-cookie') || '';
ok('it opens the app with the demo account cookie for triodian.com', res.status === 303 && res.headers.get('location') === 'https://risk-appetite.triodian.com/?suite=1' && /^tri_demo=/.test(cookie) && /Domain=triodian\.com/.test(cookie) && /HttpOnly/.test(cookie), cookie);
const body = JSON.parse(atob(cookie.split('=')[1].split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
ok('the cookie names the demo account, not the visitor', body.e === 'demo@triodian.com');
// The apps read the cookie with lib/identity/session.js (the same file in every app): it lets the demo account in.
const appEnv = { DEMO_SESSION_KEY: env.DEMO_SESSION_KEY, DEMO_LOGIN: JSON.stringify([{ username: 'trio_demo', email: 'demo@triodian.com', hash: 'pbkdf2-sha256$1$AA$AA' }]) };
const asApp = c => sessionEmail(new Request('https://risk-appetite.triodian.com/', { headers: { cookie: c.split(';')[0] } }), appEnv);
ok('an app signs the visitor in as the demo account with that cookie', (await asApp(cookie)) === 'demo@triodian.com');
ok('a cookie signed with another key is refused', (await asApp('tri_demo=' + await demoTokenFor('other-key', 'demo@triodian.com', Math.floor(Date.now() / 1000) + 60))) === null);
ok('a cookie for anyone but the demo account is refused', (await asApp('tri_demo=' + await demoTokenFor(env.DEMO_SESSION_KEY, 'ana@coastline.example', Math.floor(Date.now() / 1000) + 60))) === null);
res = await tryFirst(new Request('https://start-test.triodian.com/auth/try?app=aiBoardDirection'), { ...env, APP_HOST_SUFFIX: '-test' });
ok('on the test site it opens the test app', res.headers.get('location') === 'https://board-direction-test.triodian.com/?suite=1');
res = await tryFirst(new Request('https://start.triodian.com/auth/try?app=aiRiskAppetite'), { SUITE_DEMO: 'on' });
ok('without the demo key it goes back to the landing page and says so', res.headers.get('location') === '/?try=off' && !res.headers.get('set-cookie'));
res = await tryFirst(new Request('https://start.triodian.com/auth/try?from=start&app=x'), env);
ok('an unknown app opens nothing, and goes back to the page it came from', res.headers.get('location') === '/start/?try=unknown' && !res.headers.get('set-cookie'));
console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0);
