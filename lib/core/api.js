// The Triodian Start API, independent of any cloud provider (development plan tasks 5.1 and 5.2).
// handle() takes a plain request description, a storage adapter and an Atlas client, and returns { status, body }.
// Cloudflare wiring lives in src/worker.js.
//
// Anyone may sign up: the first sign-in with a proven email (Cloudflare Access email one-time PIN) adds a prospect.
// A prospect can answer the profile questions and see their solution set, which comes from the Atlas routing table
// (task 5.3) so the front door and the matter brief agree. Nothing else is reachable until a client is provisioned.

import { rolesFor, normaliseTeam, checkTeam, invitations, ENGAGEMENT_NAMES, RUN_BY, normaliseRunBy, checkRunBy } from '../../public/shared/team.js';

const NAME_MAX = 120;

/**
 * Marketing email from Triodian: opt-in only, never ticked for the person, changeable at any time on /start/.
 * The record keeps what they agreed to and when, so the consent can be shown later. Counsel to confirm the wording;
 * every email sent also needs Triodian's name and a working unsubscribe, which the mailing tool provides.
 */
export const MARKETING = {
  version: '2026-11-10',
  wording: 'Send me news, guidance and event invitations from Triodian by email. I can stop them at any time.',
};
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

  if (route === 'GET /api/me') return ok({ prospect: me, isAdmin, tryFirst: !!req.tryFirst, marketingWording: MARKETING.wording });

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
    let p = await store.updateProspect(email, { name, organisation, answers: a, solution }, now);
    // If the engagements changed after the team asked to start, the request is taken back: the team is checked again.
    const ids = x => ((x && x.engagements) || []).map(e => e.assessmentType + ':' + (e.mode || '')).join();
    if (me.status === 'team_ready' && ids(me.solution) !== ids(solution)) p = await store.setTeam(email, p.team, 'prospect', now);
    await store.audit(email, 'prospect.profile', { answers: a, engagements: solution ? solution.engagements.map(e => e.assessmentType) : [] }, now);
    return ok({ prospect: p });
  }

  // The person's choice about marketing email (opt-in). Saved as soon as they tick or untick it.
  if (route === 'PUT /api/marketing') {
    const b = req.body;
    if (!b || typeof b.consent !== 'boolean') return fail(400, 'Say yes or no to marketing email.');
    const was = me.marketing || null;
    const m = b.consent
      ? { consent: true, at: now, wording: MARKETING.wording, version: MARKETING.version, source: 'start' }
      : { consent: false, at: now, ...(was && was.consent ? { withdrawnFrom: { at: was.at, version: was.version } } : {}), source: 'start' };
    const p = await store.setMarketing(email, m, now);
    await store.audit(email, b.consent ? 'marketing.optIn' : 'marketing.optOut', { version: MARKETING.version }, now);
    return ok({ prospect: p });
  }

  // ---- the team (task 5.5): for each engagement in the saved solution set, who fills each of the client's roles.
  //      The checks run on every read and save; the engagement can start only when none fails. Starting hands the team
  //      to Triodian, who fills its own roles and sets the engagement up (task 5.6); invitations are held until then,
  //      so an open sign-up cannot be used to send email to strangers.
  //      Who runs it (task 5.4) is one choice kept with the team: the organisation's own people, a registered
  //      practitioner from the Atlas directory, or Triodian. The start waits for it like any other check.
  if (/^(GET|PUT|POST) \/api\/team(\/start)?$/.test(route) || route === 'PUT /api/run-by') {
    if (me.status === 'provisioned') return fail(409, 'Your engagement is set up. Changes to the team are made in each app.');
    const engs = (me.solution && me.solution.engagements) || [];
    if (!engs.length) return fail(409, 'Answer the questions and save them first: the team follows the engagements that fit.', { code: 'no_solution' });
    const directory = atlas.practitioners ? await atlas.practitioners() : { available: false, items: [] };
    const check = team => [...checkRunBy(team, directory), ...checkTeam(engs, team)];
    const view = p => {
      const team = p.team || { assign: {} }, problems = check(team);
      return { runBy: team.runBy || null, runByOptions: RUN_BY, practitioners: directory, engagements: engs.map(e => ({ assessmentType: e.assessmentType, name: ENGAGEMENT_NAMES[e.assessmentType], mode: e.mode || null, roles: rolesFor(e) })),
        team, problems, canStart: problems.length === 0, started: p.status === 'team_ready', invitations: invitations(engs, team, p.organisation) };
    };
    if (route === 'GET /api/team') return ok(view(me));
    if (route === 'PUT /api/team') {
      const n = normaliseTeam(req.body, engs, 'client'); if (n.error) return fail(400, n.error);
      // A change after asking to start takes the request back: Triodian sets up only a team that passed the checks as it stands.
      const withdrew = me.status === 'team_ready';
      const p = await store.setTeam(email, { ...(me.team && me.team.runBy ? { runBy: me.team.runBy } : {}), assign: n.team.assign, updatedAt: now }, 'prospect', now);
      await store.audit(email, 'team.save', { people: invitations(engs, p.team, p.organisation).length, ...(withdrew ? { withdrewStart: true } : {}) }, now);
      return ok({ ...view(p), ...(withdrew ? { withdrew: true } : {}) });
    }
    if (route === 'PUT /api/run-by') {
      const n = normaliseRunBy(req.body, directory); if (n.error) return fail(400, n.error);
      const withdrew = me.status === 'team_ready';
      const was = me.team || { assign: {} };
      const p = await store.setTeam(email, { runBy: { ...n.runBy, chosenAt: now }, assign: was.assign || {}, updatedAt: now }, 'prospect', now);
      await store.audit(email, 'team.runBy', { mode: n.runBy.mode, ...(n.runBy.firmID ? { firmID: n.runBy.firmID, firm: n.runBy.firm } : {}), ...(withdrew ? { withdrewStart: true } : {}) }, now);
      return ok({ ...view(p), ...(withdrew ? { withdrew: true } : {}) });
    }
    // POST /api/team/start
    const team = me.team || { assign: {} }, problems = check(team);
    if (problems.length) return fail(409, 'The engagement cannot start yet: ' + problems[0].reason + (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''), { code: 'team_not_ready', problems });
    const p = await store.setTeam(email, { ...team, startedAt: now }, 'team_ready', now);
    await store.audit(email, 'team.start', { runBy: team.runBy.mode, ...(team.runBy.firm ? { firm: team.runBy.firm } : {}), engagements: engs.map(e => e.assessmentType), people: invitations(engs, team, me.organisation).length }, now);
    return ok(view(p));
  }

  // The journey and the engagement itself (tasks 5.6 and 5.7) wait for provisioning.
  if (/^(GET|PUT|POST) \/api\/(journey|engagement)(\/|$)/.test(route)) {
    if (me.status !== 'provisioned') return fail(403, 'Nothing else is open until Triodian has set up your engagement. Your answers are saved.', { code: 'not_provisioned' });
    return fail(404, 'Not built yet.');
  }

  if (route === 'GET /api/admin/prospects') {
    if (!isAdmin) return fail(403, 'Only a Triodian administrator can see the sign-ups.');
    return ok({ prospects: await store.listProspects() });
  }
  // Who has opted in to marketing email, for the mailing tool: only those whose latest choice is yes.
  if (route === 'GET /api/admin/marketing') {
    if (!isAdmin) return fail(403, 'Only a Triodian administrator can see the marketing list.');
    const list = (await store.listProspects()).filter(p => p.marketing && p.marketing.consent)
      .map(p => ({ email: p.email, name: p.name, organisation: p.organisation, consentedAt: p.marketing.at, wordingVersion: p.marketing.version }));
    if ((req.query || {}).format === 'csv') {
      // A cell that starts with = + - or @ is prefixed so a spreadsheet does not run it as a formula.
      const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return { status: 200, csv: ['email,name,organisation,consented_at,wording_version', ...list.map(r => [r.email, r.name, r.organisation, r.consentedAt, r.wordingVersion].map(cell).join(','))].join('\n') + '\n' };
    }
    return ok({ wording: MARKETING, people: list });
  }

  return fail(404, 'No such request.');
}

/** An Atlas client over fetch (a service binding's fetch, or the public one), with the table cached for five minutes. */
export function atlasClient(fetcher, base) {
  let cache = { at: 0, table: null }, dirCache = { at: 0, dir: null };
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
    /** The practitioner directory (task 5.4): { available, items: [{ firmID, firm, roles, jurisdictions }] }, kept for five minutes. */
    async practitioners() {
      if (dirCache.dir && Date.now() - dirCache.at < 300e3) return dirCache.dir;
      const d = await get('/api/v1/firms/directory');
      if (!d || d.error || !Array.isArray(d.items)) return { available: false, items: (dirCache.dir && dirCache.dir.items) || [] };
      const clean = { available: d.available !== false, items: d.items.filter(x => x && typeof x.firmID === 'string' && typeof x.firm === 'string').slice(0, 500)
        .map(x => ({ firmID: x.firmID.slice(0, 80), firm: x.firm.slice(0, 160), roles: (Array.isArray(x.roles) ? x.roles : []).filter(r => typeof r === 'string').slice(0, 10).map(r => r.slice(0, 120)), jurisdictions: (Array.isArray(x.jurisdictions) ? x.jurisdictions : []).filter(j => typeof j === 'string').slice(0, 10) })) };
      if (clean.available) dirCache = { at: Date.now(), dir: clean };
      return clean;
    },
  };
}
