// Provisioning on completion (development plan task 5.6), independent of any cloud provider.
//
// A prospect who has formed a team asks Triodian to set the engagement up (status team_ready). A Triodian administrator
// then approves the request: names the people on the delivery side, gives the client a code, and names the client's
// first administrator. Approval produces a job file for the phase 4 provisioning script (practice-hub,
// tools/provision-client.mjs --job), which the administrator runs on their own computer, where the Cloudflare token
// is. The script stands the client's apps up and adds the people with their roles; its result file comes back here,
// the request becomes provisioned, and the administrator sends the invitations.
//
// Start holds no Cloudflare token and runs nothing in Cloudflare itself.
import { rolesFor, normaliseTeam, checkTeam, checkRunBy, ENGAGEMENT_NAMES } from '../../public/shared/team.js';

/** Each engagement's app id, as the installer, the identity database and the provisioning script know it. */
export const APP_OF = { aiBoardDirection: 'board-direction', aiRiskAppetite: 'risk-appetite', aiUseAssessment: 'use-assessment', aiConfidentialityExposureAssessment: 'confidentiality' };
/** The client code: the provisioning script's own rule (it becomes part of hostnames, Worker and database names). */
export const CODE = /^[a-z](?:[a-z0-9]|-(?!-)){0,18}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const JOB_FORMAT = 'triodian.provisionJob/1', RESULT_FORMAT = 'triodian.provisionResult/1';
/** Statuses a request moves through, in order. */
export const QUEUE = ['team_ready', 'approved', 'provisioned'];

const engs = p => ((p.solution && p.solution.engagements) || []).map(e => ({ assessmentType: e.assessmentType, mode: e.mode || undefined }));
const clientAssign = p => (p.team && p.team.assign) || {};
/** The client's team and the delivery side's, as one team. */
export function fullTeam(p, delivery) {
  const assign = {};
  for (const src of [clientAssign(p), (delivery && delivery.assign) || {}]) for (const [a, roles] of Object.entries(src)) assign[a] = { ...(assign[a] || {}), ...roles };
  return { assign, runBy: p.team && p.team.runBy };
}
/** Everything that stops the engagement being set up, with the delivery side's roles checked too. */
export const problemsFor = (p, delivery) => [...checkRunBy(p.team, null), ...checkTeam(engs(p), fullTeam(p, delivery), { triodian: true })];

/** Each person once, with their roles in each app. `admin` marks the client's first administrator. */
export function peopleFor(p, pv) {
  const by = new Map();
  const add = (person, organisation) => {
    const k = String(person.email || '').trim().toLowerCase(); if (!EMAIL.test(k)) return null;
    if (!by.has(k)) by.set(k, { email: k, name: person.name || '', organisation, admin: false, apps: {} });
    const x = by.get(k); if (!x.name && person.name) x.name = person.name;
    return x;
  };
  const team = fullTeam(p, pv.delivery);
  for (const e of engs(p)) for (const r of rolesFor(e)) for (const person of ((team.assign[e.assessmentType] || {})[r.id] || [])) {
    const x = add(person, r.side === 'client' ? (p.organisation || '') : (pv.deliveryOrganisation || 'Triodian')); if (!x) continue;
    const app = APP_OF[e.assessmentType];
    if (!(x.apps[app] = x.apps[app] || []).includes(r.id)) x.apps[app].push(r.id);
  }
  // The first administrator is in every app, with or without a role, so someone can always manage people there.
  const a = add({ email: pv.admin, name: pv.admin === String(p.email || '').toLowerCase() ? (p.name || '') : '' }, pv.admin === String(p.email || '').toLowerCase() ? (p.organisation || '') : ''); if (a) { a.admin = true; for (const e of engs(p)) a.apps[APP_OF[e.assessmentType]] = a.apps[APP_OF[e.assessmentType]] || []; }
  return [...by.values()].sort((x, y) => x.email.localeCompare(y.email));
}

/**
 * Checks an approval. body: { code, admin, deliveryOrganisation?, delivery: { assign } }.
 * Returns { provision } to keep, or { error, problems? }.
 */
export function approval(p, body, others, by, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'The approval is not in the expected form.' };
  const code = String(body.code || '').trim();
  if (!CODE.test(code)) return { error: 'The client code is 2 to 20 lowercase letters, digits and hyphens, starting with a letter and not ending with a hyphen.' };
  if (others.some(o => o.id !== p.id && o.clientCode === code)) return { error: `The client code ${code} is already used by another client.` };
  const admin = String(body.admin || '').trim().toLowerCase();
  if (!EMAIL.test(admin) || admin.length > 200) return { error: 'Give the email address of the client’s first administrator.' };
  const org = String(body.deliveryOrganisation || '').trim();
  if (org.length > 120) return { error: 'The delivery organisation’s name is at most 120 characters.' };
  const n = normaliseTeam(body.delivery || { assign: {} }, engs(p), 'triodian'); if (n.error) return { error: n.error };
  const problems = problemsFor(p, n.team);
  if (problems.length) return { error: 'The engagement cannot be set up yet: ' + problems[0].reason + (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''), problems };
  const a = (p.answers || {});
  return { provision: { code, admin, deliveryOrganisation: org || 'Triodian', delivery: n.team, apps: [...new Set(engs(p).map(e => APP_OF[e.assessmentType]))],
    jurisdiction: a.jurisdiction || 'AU', sector: a.sector || '', approvedBy: by, approvedAt: now } };
}

/** The job file for tools/provision-client.mjs --job (practice-hub). */
export function jobFor(p) {
  const pv = p.provision;
  return { format: JOB_FORMAT, requestId: p.id, code: pv.code, name: p.organisation || pv.code, apps: pv.apps.join(','), admin: pv.admin,
    jurisdiction: pv.jurisdiction, sector: pv.sector, runBy: (p.team && p.team.runBy) ? { mode: p.team.runBy.mode, ...(p.team.runBy.firm ? { firm: p.team.runBy.firm } : {}) } : null,
    people: peopleFor(p, pv).map(x => ({ email: x.email, name: x.name, organisation: x.organisation, admin: x.admin, apps: x.apps })),
    approvedBy: pv.approvedBy, approvedAt: pv.approvedAt };
}

/** Checks the provisioning script's result file against the request. Returns { apps } or { error }. */
export function resultOf(p, body) {
  if (!body || typeof body !== 'object' || body.format !== RESULT_FORMAT) return { error: 'This is not a provisioning result file (it is written beside the job file by tools/provision-client.mjs).' };
  if (body.requestId !== p.id || body.code !== p.provision.code) return { error: `This result is for another request (${body.code || 'no code'}), not ${p.provision.code}.` };
  if (!Array.isArray(body.apps)) return { error: 'The result lists no apps.' };
  const apps = [];
  for (const id of p.provision.apps) {
    const a = body.apps.find(x => x && x.id === id);
    let host = ''; try { const u = new URL(a.url); if (u.protocol === 'https:' && !u.username && !u.search && u.pathname === '/') host = u.host; } catch (e) {}
    if (!host || host.length > 200) return { error: `The result has no https address for ${id}.` };
    apps.push({ id, url: 'https://' + host });
  }
  return { apps, people: Number.isInteger(body.people) ? body.people : null };
}

/** One invitation a person: their roles in each engagement, with the address of each app. Sent only once provisioned. */
export function invitationsFor(p) {
  const pv = p.provision, url = Object.fromEntries((pv.appUrls || []).map(a => [a.id, a.url]));
  const names = Object.fromEntries(Object.entries(APP_OF).map(([k, v]) => [v, ENGAGEMENT_NAMES[k]]));
  const roleName = (app, rid) => { const a = Object.keys(APP_OF).find(k => APP_OF[k] === app); const r = (engs(p).filter(e => e.assessmentType === a).flatMap(rolesFor)).find(x => x.id === rid); return r ? (r.one || r.name) : rid; };
  const org = p.organisation || 'your organisation';
  return peopleFor(p, pv).map(x => {
    const lines = Object.entries(x.apps).map(([app, roles]) => `- ${names[app]}${roles.length ? ': ' + roles.map(r => roleName(app, r)).join(', ') : x.admin ? ': administrator' : ''}\n  ${url[app] || ''}`);
    return { email: x.email, name: x.name, admin: x.admin, roles: Object.entries(x.apps).flatMap(([app, roles]) => roles.map(r => ({ app, appName: names[app], role: r, roleName: roleName(app, r) }))),
      subject: `${org}’s AI governance work with Triodian is ready for you`,
      text: `${x.name ? 'Dear ' + x.name : 'Hello'},\n\n${org}’s AI governance work with Triodian is set up, and you have a part in it:\n\n${lines.join('\n')}\n\nTo sign in, open a link above and enter this email address (${x.email}). A one-time code is sent to it; there is no password.\n${Object.values(x.apps).some(rs => rs.includes('technologyOwner') || rs.includes('aiGovernance')) ? '\nAs the technology owner or a member of the AI governance team, your part is to supply what exists (the list of AI in use, the evidence and what existing assurance covers) and to shape what is reported. You are briefed before anything goes to directors, and the positions themselves are the board’s.\n' : ''}${x.admin ? '\nYou are the administrator: you can add people and change their roles in each app’s Admin.\n' : ''}\nIf you were not expecting this, reply to tell us and we will take you off.\n\nTriodian\n` };
  });
}

/** What the Triodian administrator sees for one request. */
export function requestView(p) {
  const pv = p.provision || null, e = engs(p);
  return { id: p.id, status: p.status, organisation: p.organisation, contact: { name: p.name, email: p.email }, answers: p.answers,
    runBy: (p.team && p.team.runBy) || null, askedAt: (p.team && p.team.startedAt) || null,
    engagements: e.map(x => ({ assessmentType: x.assessmentType, name: ENGAGEMENT_NAMES[x.assessmentType], mode: x.mode || null, app: APP_OF[x.assessmentType], roles: rolesFor(x) })),
    team: { assign: clientAssign(p) }, provision: pv,
    problems: problemsFor(p, pv && pv.delivery),
    invitations: pv && p.status === 'provisioned' ? invitationsFor(p).map(i => ({ email: i.email, name: i.name, admin: i.admin, roles: i.roles, subject: i.subject, text: i.text, ...(((pv.invitations || {})[i.email]) || { status: 'held' }) })) : [] };
}

/**
 * The administrator's requests. Returns { status, body } or null when the route is not one of these.
 * req.sender: a function that emails one message ({ to, subject, text }), or null while sending is off.
 */
export async function handleRequests(req, route, store, by, now) {
  const ok = body => ({ status: 200, body }), fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
  if (route === 'GET /api/admin/requests') return ok({ sending: !!req.sender, requests: (await store.listProspects()).filter(p => QUEUE.includes(p.status)).sort((a, b) => QUEUE.indexOf(a.status) - QUEUE.indexOf(b.status) || (a.updatedAt < b.updatedAt ? 1 : -1)).map(requestView) });
  const m = /^(GET|PUT|POST) \/api\/admin\/requests\/([A-Za-z0-9-]{3,40})\/(approve|job|return|provisioned|invitations)$/.exec(route);
  if (!m) return null;
  const p = await store.prospectById(m[2]);
  if (!p || !QUEUE.includes(p.status)) return fail(404, 'No such request.');
  const act = m[1] + ' ' + m[3];

  if (act === 'PUT approve') {
    if (p.status === 'provisioned') return fail(409, 'This client is already set up.');
    const a = approval(p, req.body, await store.listProspects(), by, now); if (a.error) return fail(a.problems ? 409 : 400, a.error, a.problems ? { code: 'team_not_ready', problems: a.problems } : {});
    const q = await store.setProvision(p.email, a.provision, 'approved', a.provision.code, now);
    await store.audit(by, 'request.approve', { id: p.id, code: a.provision.code, apps: a.provision.apps, people: peopleFor(q, a.provision).length }, now);
    return ok({ request: requestView(q) });
  }
  if (act === 'GET job') {
    if (!p.provision) return fail(409, 'Approve the request first: the job file is made from the approval.');
    await store.audit(by, 'request.job', { id: p.id, code: p.provision.code }, now);
    return { status: 200, body: jobFor(p), download: `triodian-job-${p.provision.code}.json` };
  }
  // Back to the client, with the reason: nothing is set up, and the client can change the team and ask again.
  if (act === 'POST return') {
    if (p.status === 'provisioned') return fail(409, 'This client is already set up; close it with the practice hub runbook instead.');
    const note = String((req.body && req.body.note) || '').trim();
    if (!note || note.length > 500) return fail(400, 'Say why, in up to 500 characters; the client sees it.');
    const team = { ...(p.team || { assign: {} }), returned: { note, at: now } }; delete team.startedAt;
    await store.setProvision(p.email, null, 'prospect', null, now);
    await store.setTeam(p.email, team, 'prospect', now);
    await store.audit(by, 'request.return', { id: p.id, note }, now);
    return ok({ returned: true });
  }
  if (act === 'POST provisioned') {
    if (p.status !== 'approved') return fail(409, p.status === 'provisioned' ? 'This client is already marked as set up.' : 'Approve the request first.');
    const r = resultOf(p, req.body); if (r.error) return fail(400, r.error);
    const q = await store.setProvision(p.email, { ...p.provision, appUrls: r.apps, provisionedBy: by, provisionedAt: now }, 'provisioned', p.provision.code, now);
    await store.audit(by, 'request.provisioned', { id: p.id, code: p.provision.code, apps: r.apps.map(a => a.url) }, now);
    return ok({ request: requestView(q) });
  }
  // POST invitations: send to everyone not yet sent to (or to the addresses named in `again`).
  if (p.status !== 'provisioned') return fail(409, 'Invitations go out once the client’s apps are set up: upload the provisioning result first.', { code: 'not_provisioned' });
  if (!req.sender) return fail(503, 'Email sending is not switched on for this site, so nothing was sent (docs/setup.md, “Invitations”).', { code: 'sending_off' });
  const again = new Set(((req.body && Array.isArray(req.body.again)) ? req.body.again : []).map(e => String(e).toLowerCase()));
  const log = { ...(p.provision.invitations || {}) }; let sent = 0, failed = 0;
  for (const i of invitationsFor(p)) {
    const was = log[i.email];
    if (was && was.status === 'sent' && !again.has(i.email)) continue;
    try { await req.sender({ to: i.email, subject: i.subject, text: i.text }); log[i.email] = { status: 'sent', at: now, by }; sent++; }
    catch (e) { log[i.email] = { status: 'failed', at: now, error: String((e && e.message) || e).slice(0, 200) }; failed++; }
  }
  const q = await store.setProvision(p.email, { ...p.provision, invitations: log }, 'provisioned', p.provision.code, now);
  await store.audit(by, 'request.invitations', { id: p.id, sent, failed }, now);
  return ok({ sent, failed, request: requestView(q) });
}
