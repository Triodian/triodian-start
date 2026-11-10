// The Triodian Start API, independent of any cloud provider (development plan tasks 5.1 and 5.2).
// handle() takes a plain request description, a storage adapter and an Atlas client, and returns { status, body }.
// Cloudflare wiring lives in src/worker.js.
//
// Anyone may sign up: the first sign-in with a proven email (Cloudflare Access email one-time PIN) adds a prospect.
// A prospect can answer the profile questions and see their solution set, which comes from the Atlas routing table
// (task 5.3) so the front door and the matter brief agree. Nothing else is reachable until a client is provisioned.

const NAME_MAX = 120;
const newId = () => 'P-' + crypto.randomUUID().slice(0, 8);
const ok = body => ({ status: 200, body });
const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

/** Checks the profile answers against the routing table. Returns an error string, or null. Every answer is optional. */
export function answersError(a, table) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return 'The answers are not in the expected form.';
  const known = ['role', 'jurisdiction', 'sector', 'entityType', 'size', 'prompt'];
  const extra = Object.keys(a).filter(k => !known.includes(k));
  if (extra.length) return `Unknown answer ${extra.join(', ')}.`;
  for (const [k, v] of Object.entries(a)) if (v != null && (typeof v !== 'string' || v.length > 60)) return `The answer ${k} is not in the expected form.`;
  const has = (list, id, key = 'id') => !id || list.some(x => x[key] === id);
  if (!has(table.roles, a.role)) return `Unknown role ${a.role}.`;
  if (!has(table.jurisdictions, a.jurisdiction, 'code')) return `Unknown jurisdiction ${a.jurisdiction}.`;
  if (!has(table.sizes, a.size)) return `Unknown size ${a.size}.`;
  if (!has(table.prompts, a.prompt)) return `Unknown prompt ${a.prompt}.`;
  if (a.sector) {
    const d = table.sectors.find(x => x.regulatedSectorID === a.sector);
    if (!d) return `Unknown sector ${a.sector}.`;
    if (a.jurisdiction && d.jurisdiction !== a.jurisdiction) return `The sector ${d.name} is not in ${a.jurisdiction}.`;
  }
  if (a.entityType && !(a.entityType in (table.entityTypeNames || {}))) return `Unknown organisation type ${a.entityType}.`;
  if (a.sector && a.entityType) return 'Choose a regulated sector or an organisation type, not both.';
  return null;
}

/** The Atlas query for these answers (GET /api/v1/solution-set). */
export function solutionQuery(a) {
  const q = new URLSearchParams();
  for (const [k, p] of [['role', 'role'], ['jurisdiction', 'jurisdiction'], ['sector', 'sector'], ['entityType', 'entityType'], ['size', 'size'], ['prompt', 'prompt']]) if (a[k]) q.set(p, a[k]);
  return q.toString();
}

/**
 * req: { method, path, email, query, body (parsed JSON or undefined), admins: [emails] }
 * atlas: { table(): Promise<table>, solutionSet(query): Promise<solution set | { error, status }> }
 */
export async function handle(req, store, atlas) {
  await store.init();
  const now = new Date().toISOString();
  const route = req.method + ' ' + req.path.replace(/\/+$/, '');
  const email = String(req.email || '').toLowerCase();
  if (!email) return fail(401, 'Sign in with your email to continue.');
  const isAdmin = (req.admins || []).map(e => e.toLowerCase()).includes(email);

  // Signing up: the first sign-in adds the prospect.
  let me = await store.prospectByEmail(email);
  if (!me) {
    me = await store.insertProspect({ id: newId(), email, createdAt: now });
    await store.audit(email, 'prospect.signup', { id: me.id }, now);
  }

  if (route === 'GET /api/me') return ok({ prospect: me, isAdmin, tryFirst: !!req.tryFirst });

  if (route === 'GET /api/table') {
    const t = await atlas.table();
    return t && !t.error ? ok(t) : fail(502, 'The Atlas could not be reached for the routing table. Try again shortly.', { code: 'atlas' });
  }

  // A preview while answering, so each answer changes what is shown next; nothing is saved.
  if (route === 'GET /api/solution-set') {
    const t = await atlas.table();
    if (!t || t.error) return fail(502, 'The Atlas could not be reached. Try again shortly.', { code: 'atlas' });
    const a = Object.fromEntries(Object.entries(req.query || {}).filter(([k]) => ['role', 'jurisdiction', 'sector', 'entityType', 'size', 'prompt'].includes(k)));
    const why = answersError(a, t); if (why) return fail(400, why);
    const s = await atlas.solutionSet(solutionQuery(a));
    return s && !s.error ? ok(s) : fail(s && s.status === 400 ? 400 : 502, (s && s.error) || 'The Atlas gave no solution set.');
  }

  if (route === 'PUT /api/profile') {
    const b = req.body;
    if (!b || typeof b !== 'object') return fail(400, 'The profile is not in the expected form.');
    const name = String(b.name || '').trim(), organisation = String(b.organisation || '').trim();
    if (name.length > NAME_MAX || organisation.length > NAME_MAX) return fail(400, `Names are at most ${NAME_MAX} characters.`);
    const t = await atlas.table();
    if (!t || t.error) return fail(502, 'The Atlas could not be reached, so the answers were not saved. Try again shortly.', { code: 'atlas' });
    const a = Object.fromEntries(Object.entries(b.answers || {}).filter(([, v]) => v != null && v !== ''));
    const why = answersError(a, t); if (why) return fail(400, why);
    let solution = null;
    if (a.role && (a.sector || a.entityType)) {
      solution = await atlas.solutionSet(solutionQuery(a));
      if (!solution || solution.error) return fail(502, (solution && solution.error) || 'The Atlas gave no solution set, so the answers were not saved.');
    }
    const p = await store.updateProspect(email, { name, organisation, answers: a, solution }, now);
    await store.audit(email, 'prospect.profile', { answers: a, engagements: solution ? solution.engagements.map(e => e.assessmentType) : [] }, now);
    return ok({ prospect: p });
  }

  // Everything an engagement needs (the team, provisioning, the journey: tasks 5.5 to 5.7) waits for provisioning.
  if (/^(GET|PUT|POST) \/api\/(team|journey|engagement)(\/|$)/.test(route)) {
    if (me.status !== 'provisioned') return fail(403, 'Nothing else is open until Triodian has set up your engagement. Your answers are saved.', { code: 'not_provisioned' });
    return fail(404, 'Not built yet.');
  }

  if (route === 'GET /api/admin/prospects') {
    if (!isAdmin) return fail(403, 'Only a Triodian administrator can see the sign-ups.');
    return ok({ prospects: await store.listProspects() });
  }

  return fail(404, 'No such request.');
}

/** An Atlas client over fetch (a service binding's fetch, or the public one), with the table cached for five minutes. */
export function atlasClient(fetcher, base) {
  let cache = { at: 0, table: null };
  const get = async path => {
    let r;
    try { r = await fetcher(new Request(base.replace(/\/$/, '') + path, { headers: { accept: 'application/json' } })); }
    catch (e) { return { error: 'The Atlas could not be reached.', status: 502 }; }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) return { error: (j && (j.title || j.error)) || `The Atlas answered ${r.status}.`, status: r.status };
    return j;
  };
  return {
    async table() {
      if (cache.table && Date.now() - cache.at < 300e3) return cache.table;
      const t = await get('/api/v1/solution-set/table');
      if (t && !t.error) cache = { at: Date.now(), table: t };
      return t;
    },
    solutionSet: q => get('/api/v1/solution-set?' + q),
  };
}
