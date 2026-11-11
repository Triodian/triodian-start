// The team for each engagement (development plan task 5.5): the roles to fill, a plain explanation of each, and the
// separation-of-duty checks an engagement has to pass before it can start. One file, read by the browser (the team
// stepper) and the server (lib/core/api.js), so both give the same answer.
//
// Role ids are each app's own (public/shared/rules.js or lib/core/roles.js in that app's repo). The checks follow the
// rules the apps enforce: two different people agree the set or profile (or a named second approver where the GC also
// acts as counsel), the independent reviewer or checker stays independent, and in Triodian's own team the peer reviewer
// and validation are not the assessor. Triodian's roles are filled by Triodian, not by the client.

const TRIODIAN_ASSESSMENT = [
  { id: 'methodOwner', name: 'Method owner', side: 'triodian', min: 1, max: 1, explain: 'Owns the method and signs the technical annex.' },
  { id: 'assessor', name: 'Assessor', side: 'triodian', min: 1, max: 1, explain: 'Gathers the facts and makes the technical classifications.' },
  { id: 'peer', name: 'Peer reviewer', side: 'triodian', min: 1, max: 1, explain: 'Reviews each classification blind. Never the assessor.' },
  { id: 'validation', name: 'Validation', side: 'triodian', min: 1, max: 1, explain: 'Checks the work before it leaves Triodian. Never the assessor.' },
  { id: 'delivery', name: 'Delivery manager', side: 'triodian', min: 1, max: 1, explain: 'Runs the timetable and the document requests.' },
];

export const ROLES = {
  aiBoardDirection: [
    { id: 'chair', name: 'Chair', side: 'client', min: 1, max: 1, explain: 'Leads the board through the steps and records the resolution. Only the chair records it.' },
    { id: 'director', name: 'Directors', one: 'Director', side: 'client', min: 1, max: 12, explain: 'Complete the director briefing and propose the board’s positions. Add each director.' },
    { id: 'ceo', name: 'CEO or accountable executive', side: 'client', min: 1, max: 1, explain: 'Enters the list of AI in use and owns the 90-day action list.' },
    { id: 'gc', name: 'General counsel', side: 'client', min: 1, max: 1, explain: 'Agrees the scope and answers the board’s questions for counsel. Only the GC answers them.' },
    { id: 'cro', name: 'CRO', side: 'client', min: 1, max: 1, mode: 'connected', explain: 'Proposes positions with the directors and carries the board’s directions into the AI risk appetite engagement.' },
    { id: 'advisor', name: 'Board advisor', side: 'client', min: 0, max: 2, explain: 'Optional. Advises the board and can put questions to counsel.' },
    { id: 'areaOwner', name: 'Area owners', one: 'Area owner', side: 'client', min: 0, max: 12, explain: 'Optional. The executive who owns each area of the business the board sets a posture for.' },
    { id: 'methodOwner', name: 'Method owner', side: 'triodian', min: 1, max: 1, explain: 'Sets up the engagement and owns the method.' },
    { id: 'recorder', name: 'Recorder', side: 'triodian', min: 1, max: 1, explain: 'Records the board’s positions as it decides them.' },
  ],
  aiRiskAppetite: [
    { id: 'counsel', name: 'Counsel (facilitator)', side: 'client', min: 1, max: 1, explain: 'External counsel leads and facilitates the sessions and writes the overall position in the board’s words.' },
    { id: 'cro', name: 'CRO', side: 'client', min: 1, max: 1, explain: 'Recommends the appetite to the board and agrees the working appetite.' },
    { id: 'board', name: 'Board record', side: 'client', min: 1, max: 1, explain: 'Records the board’s approval, with its date and minute reference. Usually the company secretary.' },
    { id: 'independent', name: 'Independent reviewer', side: 'client', min: 1, max: 1, explain: 'Challenges the positions. Holds no other role in this engagement.' },
    { id: 'gc', name: 'General counsel', side: 'client', min: 0, max: 1, explain: 'Optional. Can write the overall position and answer questions for counsel.' },
    { id: 'risk', name: 'Risk function', side: 'client', min: 0, max: 6, explain: 'Optional. Supports the CRO with thresholds, tolerances and measures.' },
    { id: 'triodian', name: 'Recorder', side: 'triodian', min: 1, max: 1, explain: 'Supplies the structure and the technical scales, and records the decisions.' },
  ],
  aiUseAssessment: [
    { id: 'counsel', name: 'Counsel', side: 'client', min: 1, max: 1, explain: 'Engages the assessment under privilege, agrees the set of arrangements and makes every legal determination.' },
    { id: 'gc', name: 'General counsel', side: 'client', min: 1, max: 1, explain: 'Agrees the set of arrangements for the company.' },
    { id: 'executive', name: 'Second approver (company executive)', side: 'client', min: 0, max: 1, whenGcIsCounsel: true, explain: 'Needed only where the GC also acts as counsel: a second person agrees the set.' },
    { id: 'cro', name: 'CRO', side: 'client', min: 1, max: 1, explain: 'Receives the findings and the independent reviewer’s report.' },
    { id: 'owner', name: 'Arrangement owners', one: 'Arrangement owner', side: 'client', min: 1, max: 15, explain: 'The person who runs each provider arrangement in scope. Add each one.' },
    { id: 'ir', name: 'Independent reviewer', side: 'client', min: 1, max: 1, explain: 'Checks the assessment on the CRO’s behalf. Holds no other role in this engagement.' },
    ...TRIODIAN_ASSESSMENT,
  ],
  aiConfidentialityExposureAssessment: [
    { id: 'counsel', name: 'Counsel (law firm)', side: 'client', min: 1, max: 1, explain: 'Engages the assessment under privilege, agrees the matter profile and determines what the duties call for.' },
    { id: 'gc', name: 'GC or approving executive', side: 'client', min: 1, max: 1, explain: 'Agrees the matter profile for the company.' },
    { id: 'executive', name: 'Second approver (company executive)', side: 'client', min: 0, max: 1, whenGcIsCounsel: true, explain: 'Needed only where the GC also acts as counsel: a second person agrees the profile.' },
    { id: 'dealLead', name: 'Matter team lead', side: 'client', min: 1, max: 1, explain: 'Says who is on the matter and which tools they use.' },
    { id: 'tenantOwner', name: 'Tenant owner', side: 'client', min: 1, max: 1, explain: 'Supplies the configuration summary for the company’s AI and collaboration tools.' },
    { id: 'checker', name: 'Independent checker', side: 'client', min: 0, max: 1, explain: 'Optional. Checks the assessment. Holds no other role in this engagement.' },
    ...TRIODIAN_ASSESSMENT.map(r => (r.id === 'peer' ? { ...r, name: 'Classification reviewer' } : r)),
  ],
};
export const ENGAGEMENT_NAMES = { aiBoardDirection: 'AI Board Direction', aiRiskAppetite: 'AI Risk Appetite', aiUseAssessment: 'AI Use Assessment', aiConfidentialityExposureAssessment: 'AI Confidentiality Exposure Assessment' };
const INDEPENDENT = { aiRiskAppetite: 'independent', aiUseAssessment: 'ir', aiConfidentialityExposureAssessment: 'checker' };
const TWO_AGREE = { aiUseAssessment: 'the set of arrangements', aiConfidentialityExposureAssessment: 'the matter profile' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_MAX = 120, EMAIL_MAX = 200;
const key = p => String((p && p.email) || '').trim().toLowerCase();
const label = p => (p.name ? p.name : p.email);

/** The roles of one engagement of a solution set, for its mode. */
export function rolesFor(engagement) {
  return (ROLES[engagement.assessmentType] || []).filter(r => !r.mode || r.mode === engagement.mode);
}
const people = (team, a, r) => ((((team || {}).assign || {})[a] || {})[r] || []).filter(p => p && (p.name || p.email));

/**
 * Cleans a team sent by the browser against the solution set's engagements. Returns { team } or { error }.
 * side: 'client' keeps only the client's roles (a client cannot fill Triodian's); 'triodian' only Triodian's.
 */
export function normaliseTeam(input, engagements, side = 'client') {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.assign != null && (typeof input.assign !== 'object' || Array.isArray(input.assign)))) return { error: 'The team is not in the expected form.' };
  const assign = {};
  const byId = new Map((engagements || []).map(e => [e.assessmentType, e]));
  for (const [a, roles] of Object.entries(input.assign || {})) {
    const e = byId.get(a);
    if (!e) return { error: `${ENGAGEMENT_NAMES[a] || a} is not in your solution set.` };
    if (!roles || typeof roles !== 'object' || Array.isArray(roles)) return { error: 'The team is not in the expected form.' };
    for (const [rid, list] of Object.entries(roles)) {
      const role = rolesFor(e).find(r => r.id === rid);
      if (!role) return { error: `${ENGAGEMENT_NAMES[a]} has no role ${rid}.` };
      if (role.side !== side) return { error: side === 'client' ? `${role.name} in ${ENGAGEMENT_NAMES[a]} is filled by Triodian.` : `${role.name} in ${ENGAGEMENT_NAMES[a]} is filled by the client.` };
      if (!Array.isArray(list) || list.length > 20) return { error: 'The team is not in the expected form.' };
      const out = [];
      for (const p of list) {
        if (!p || typeof p !== 'object') return { error: 'The team is not in the expected form.' };
        const name = String(p.name || '').trim(), email = String(p.email || '').trim().toLowerCase();
        if (name.length > NAME_MAX || email.length > EMAIL_MAX) return { error: 'A name or email address is too long.' };
        if (name || email) out.push({ name, email });
      }
      if (out.length) (assign[a] = assign[a] || {})[rid] = out;
    }
  }
  return { team: { assign } };
}

/**
 * The checks before an engagement can start. Returns a list of problems, each { engagement, role?, code, reason };
 * empty means it can start. opts.triodian: also check Triodian's own roles (when Triodian has named its team).
 */
export function checkTeam(engagements, team, opts = {}) {
  const out = [];
  for (const e of engagements || []) {
    const a = e.assessmentType, en = ENGAGEMENT_NAMES[a] || a, roles = rolesFor(e);
    const add = (code, reason, role) => out.push({ engagement: a, ...(role ? { role } : {}), code, reason });
    const one = rid => people(team, a, rid)[0] || null;
    const gc = one('gc'), counsel = one('counsel');
    const gcIsCounsel = !!TWO_AGREE[a] && !!key(gc) && key(gc) === key(counsel);
    for (const r of roles) {
      if (r.side === 'triodian' && !opts.triodian) continue;
      const list = people(team, a, r.id);
      const min = r.whenGcIsCounsel ? (gcIsCounsel ? 1 : 0) : r.min;
      for (const p of list) {
        if (!p.email) add('email', `${en}: ${r.name} needs an email address for ${p.name}, so they can be invited.`, r.id);
        else if (!EMAIL.test(p.email)) add('email', `${en}: “${p.email}” for ${r.name} is not an email address.`, r.id);
      }
      const seen = new Set();
      for (const p of list) { const k = key(p); if (k && seen.has(k)) add('duplicate', `${en}: ${label(p)} is named twice as ${r.name}.`, r.id); seen.add(k); }
      if (list.length > r.max) add('tooMany', `${en}: ${r.name} takes ${r.max === 1 ? 'one person' : 'at most ' + r.max + ' people'}.`, r.id);
      if (list.length < min) {
        if (r.whenGcIsCounsel) add('secondApprover', `${en}: ${label(gc)} is both the GC and counsel. Two people agree ${TWO_AGREE[a]}, so name a second approver, a company executive who is someone else.`, r.id);
        else add('unfilled', `${en}: no one is named as ${r.one || r.name}.`, r.id);
      }
    }
    // Two different people agree the set or profile: where the GC also acts as counsel, the second approver is someone else.
    const second = one('executive');
    if (gcIsCounsel && second && key(second) === key(gc)) add('secondApprover', `${en}: the second approver is ${label(gc)}, who is already the GC and counsel. Name someone else.`, 'executive');
    // The independent reviewer or checker holds no other role in the engagement.
    const ind = INDEPENDENT[a] ? one(INDEPENDENT[a]) : null;
    if (ind && key(ind)) {
      const also = roles.filter(r => r.id !== INDEPENDENT[a] && people(team, a, r.id).some(p => key(p) === key(ind)));
      if (also.length) add('independence', `${en}: ${label(ind)} is the ${roles.find(r => r.id === INDEPENDENT[a]).name.toLowerCase()} and also ${also.map(r => r.name).join(' and ')}. The reviewer holds no other role, so the check stays independent.`, INDEPENDENT[a]);
    }
    // Triodian's own team: the peer reviewer and validation are not the assessor.
    if (opts.triodian) {
      const assessor = one('assessor');
      for (const rid of ['peer', 'validation']) {
        const p = one(rid);
        if (assessor && p && key(p) && key(p) === key(assessor)) add('ownWork', `${en}: ${label(p)} is both the assessor and ${roles.find(r => r.id === rid).name.toLowerCase()}. No one reviews their own work.`, rid);
      }
    }
  }
  return out;
}

/** Who would be invited, once: each person with every role they hold. Only the client's people; Triodian names its own. */
export function invitations(engagements, team, organisation) {
  const by = new Map();
  for (const e of engagements || []) for (const r of rolesFor(e)) {
    if (r.side !== 'client') continue;
    for (const p of people(team, e.assessmentType, r.id)) {
      if (!EMAIL.test(p.email || '')) continue;
      const x = by.get(key(p)) || { email: key(p), name: p.name || '', roles: [] };
      if (!x.name && p.name) x.name = p.name;
      x.roles.push({ engagement: e.assessmentType, engagementName: ENGAGEMENT_NAMES[e.assessmentType], role: r.id, roleName: r.one || r.name });
      by.set(key(p), x);
    }
  }
  const org = organisation || 'your organisation';
  return [...by.values()].map(x => ({ ...x, status: 'held',
    subject: `Your role in ${org}’s AI governance work with Triodian`,
    text: `${x.name ? 'Dear ' + x.name : 'Hello'},\n\nYou have been named in ${org}’s AI governance work with Triodian:\n\n${x.roles.map(r => `- ${r.engagementName}: ${r.roleName}`).join('\n')}\n\nYou will receive a link to sign in with this email address once the engagement is set up.\n` }));
}

/** How many of the client's roles that need someone have someone, for the stepper's progress. */
export function progress(engagement, team) {
  const need = rolesFor(engagement).filter(r => r.side === 'client' && r.min > 0);
  return { filled: need.filter(r => people(team, engagement.assessmentType, r.id).length >= r.min).length, of: need.length };
}

// ---- who runs it (development plan task 5.4). One choice for the organisation's engagements: its own people, a
//      registered practitioner (a firm approved in the Atlas firm registry that asked to be listed), or Triodian.
//      Triodian fills its own roles in every case; the choice is who leads the work with the client.
export const RUN_BY = [
  { id: 'self', name: 'We run it ourselves', explain: 'Your own people lead the work, using the guide in each app. Triodian sets the engagement up and fills only the roles marked “Filled by Triodian”.' },
  { id: 'practitioner', name: 'With a registered practitioner', explain: 'A firm registered with Triodian, such as a fractional GC or a board advisor, leads the work with you. Triodian introduces you to the firm when it sets the engagement up; your details are not passed on before then.' },
  { id: 'triodian', name: 'With Triodian', explain: 'Triodian leads the work with you.' },
];

/**
 * The choice in the form it is kept. `directory` is the practitioner directory, { available, items: [{ firmID, firm,
 * roles, jurisdictions }] }. Returns { runBy } or { error }.
 */
export function normaliseRunBy(input, directory) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'The choice is not in the expected form.' };
  if (!RUN_BY.some(o => o.id === input.mode)) return { error: 'Choose who runs the engagement: your own people, a registered practitioner, or Triodian.' };
  if (input.mode !== 'practitioner') return { runBy: { mode: input.mode } };
  const items = (directory && directory.items) || [];
  const f = items.find(x => x.firmID === input.firmID);
  if (!f) return { error: directory && directory.available === false && !items.length ? 'The list of registered practitioners could not be read. Try again shortly.' : 'Choose a practitioner from the list.' };
  return { runBy: { mode: 'practitioner', firmID: f.firmID, firm: f.firm } };
}

/**
 * What stops a start because of the choice: none made, or a practitioner that is no longer listed (checked only when
 * the directory could be read). Problems carry engagement: null, since the choice covers every engagement.
 */
export function checkRunBy(team, directory) {
  const rb = team && team.runBy;
  if (!rb || !RUN_BY.some(o => o.id === rb.mode)) return [{ code: 'runBy', engagement: null, reason: 'Choose who runs the engagement.' }];
  if (rb.mode === 'practitioner') {
    if (!rb.firmID) return [{ code: 'runBy', engagement: null, reason: 'Choose a registered practitioner.' }];
    if (directory && directory.available !== false && !(directory.items || []).some(x => x.firmID === rb.firmID))
      return [{ code: 'runByGone', engagement: null, reason: `${rb.firm || 'The practitioner you chose'} is no longer listed as a practitioner. Choose again.` }];
  }
  return [];
}
