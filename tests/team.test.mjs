// The team and its separation-of-duty checks (development plan task 5.5). Run: node tests/team.test.mjs
import { ROLES, rolesFor, checkTeam, normaliseTeam, invitations, progress } from '../public/shared/team.js';
import { handle, atlasClient } from '../lib/core/api.js';
import { memoryStore } from '../lib/store/d1.js';
import { stubFetch } from './atlas/stub.mjs';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra && !cond ? ' → ' + extra : '')); };
// Each app's own role ids (its public/shared/rules.js or lib/core/roles.js), so the stepper names real roles.
const APP_ROLES = {
  aiBoardDirection: ['methodOwner', 'recorder', 'advisor', 'gc', 'chair', 'director', 'ceo', 'cro', 'areaOwner'],
  aiRiskAppetite: ['counsel', 'gc', 'triodian', 'cro', 'risk', 'independent', 'board'],
  aiUseAssessment: ['methodOwner', 'assessor', 'peer', 'validation', 'delivery', 'counsel', 'gc', 'owner', 'ir', 'cro', 'executive'],
  aiConfidentialityExposureAssessment: ['methodOwner', 'assessor', 'peer', 'validation', 'delivery', 'counsel', 'gc', 'dealLead', 'tenantOwner', 'checker', 'executive'],
};
for (const [a, roles] of Object.entries(ROLES)) {
  ok(`${a}: every role is one of the app's own, once, with an explanation`, roles.every(r => APP_ROLES[a].includes(r.id) && r.explain && ['client', 'triodian'].includes(r.side)) && new Set(roles.map(r => r.id)).size === roles.length && roles.length === APP_ROLES[a].length);
}
ok('no "must" or "required" in the wording', !/\b(must|required)\b/i.test(JSON.stringify(ROLES)));

const P = (name, email) => ({ name, email });
const regulated = [{ assessmentType: 'aiBoardDirection', mode: 'connected' }, { assessmentType: 'aiRiskAppetite' }, { assessmentType: 'aiUseAssessment' }];
ok('the CRO is a Board Direction role only in connected mode', rolesFor(regulated[0]).some(r => r.id === 'cro') && !rolesFor({ assessmentType: 'aiBoardDirection', mode: 'standalone' }).some(r => r.id === 'cro'));

const good = () => ({ assign: {
  aiBoardDirection: { chair: [P('Cy Chair', 'cy@coastline.example')], director: [P('Di One', 'di@coastline.example'), P('Dov Two', 'dov@coastline.example')], ceo: [P('Cleo', 'cleo@coastline.example')], gc: [P('Gia', 'gia@coastline.example')], cro: [P('Ana', 'ana@coastline.example')] },
  aiRiskAppetite: { counsel: [P('Kim Counsel', 'kim@lawfirm.example')], cro: [P('Ana', 'ana@coastline.example')], board: [P('Sec', 'sec@coastline.example')], independent: [P('Ira', 'ira@review.example')] },
  aiUseAssessment: { counsel: [P('Kim Counsel', 'kim@lawfirm.example')], gc: [P('Gia', 'gia@coastline.example')], cro: [P('Ana', 'ana@coastline.example')], owner: [P('Owen', 'owen@coastline.example')], ir: [P('Ira', 'ira@review.example')] },
} });
const codes = t => checkTeam(regulated, t).map(p => p.code + ':' + p.engagement + ':' + (p.role || ''));
ok('a complete team with no conflicts can start', checkTeam(regulated, good()).length === 0, JSON.stringify(checkTeam(regulated, good())));
ok('an empty team lists every needed role, and nothing optional', checkTeam(regulated, { assign: {} }).every(p => p.code === 'unfilled') && checkTeam(regulated, { assign: {} }).length === 5 + 4 + 5);

let t = good(); delete t.assign.aiRiskAppetite.board;
ok('a needed role left empty stops the start, and the reason names it', codes(t).join() === 'unfilled:aiRiskAppetite:board' && /AI Risk Appetite: no one is named as Board record/.test(checkTeam(regulated, t)[0].reason));

t = good(); t.assign.aiUseAssessment.gc = [P('Kim Counsel', 'KIM@lawfirm.example')];
ok('the GC also acting as counsel needs a second approver', codes(t).join() === 'secondApprover:aiUseAssessment:executive' && /Kim Counsel is both the GC and counsel\. Two people agree the set of arrangements/.test(checkTeam(regulated, t)[0].reason));
t.assign.aiUseAssessment.executive = [P('Kim Counsel', 'kim@lawfirm.example')];
ok('who is someone else', codes(t).join() === 'secondApprover:aiUseAssessment:executive' && /already the GC and counsel/.test(checkTeam(regulated, t)[0].reason));
t.assign.aiUseAssessment.executive = [P('Cleo', 'cleo@coastline.example')];
ok('with a different second approver it can start', checkTeam(regulated, t).length === 0);
ok('Board Direction and Risk Appetite have no two-agreement rule', !rolesFor(regulated[0]).some(r => r.whenGcIsCounsel) && !rolesFor(regulated[1]).some(r => r.whenGcIsCounsel));

t = good(); t.assign.aiUseAssessment.ir = [P('Ana', 'ana@coastline.example')];
ok('the independent reviewer holding another role is a conflict, with the reason', codes(t).join() === 'independence:aiUseAssessment:ir' && /Ana is the independent reviewer and also CRO\. The reviewer holds no other role/.test(checkTeam(regulated, t)[0].reason));
ok('the same person may review in two engagements', checkTeam(regulated, good()).length === 0); // Ira reviews both RA and UA

t = good(); t.assign.aiBoardDirection.chair.push(P('Second Chair', 'c2@coastline.example'));
ok('one chair only', codes(t).join() === 'tooMany:aiBoardDirection:chair');
t = good(); t.assign.aiBoardDirection.director.push(P('Di Again', 'DI@coastline.example'));
ok('the same person twice in a role is caught', codes(t).join() === 'duplicate:aiBoardDirection:director');
t = good(); t.assign.aiBoardDirection.ceo = [P('Cleo', 'cleo-at-coastline')];
ok('an address that is not an email is caught', codes(t).join() === 'email:aiBoardDirection:ceo');
t = good(); t.assign.aiBoardDirection.ceo = [P('Cleo', '')];
ok('a name without an email cannot be invited', codes(t).join() === 'email:aiBoardDirection:ceo');

// Triodian's own team: checked when Triodian names it (task 5.6)
t = good(); Object.assign(t.assign.aiUseAssessment, { methodOwner: [P('M', 'm@triodian.com')], assessor: [P('A', 'a@triodian.com')], peer: [P('A', 'a@triodian.com')], validation: [P('V', 'v@triodian.com')], delivery: [P('D', 'd@triodian.com')] });
Object.assign(t.assign.aiBoardDirection, { methodOwner: [P('M', 'm@triodian.com')], recorder: [P('R', 'r@triodian.com')] }); t.assign.aiRiskAppetite.triodian = [P('R', 'r@triodian.com')];
const tri = checkTeam(regulated, t, { triodian: true });
ok('a peer reviewer who is also the assessor is a conflict', tri.length === 1 && tri[0].code === 'ownWork' && /No one reviews their own work/.test(tri[0].reason), JSON.stringify(tri));

// What the client may send
ok('a client cannot fill a Triodian role', /filled by Triodian/.test(normaliseTeam({ assign: { aiUseAssessment: { assessor: [P('X', 'x@x.example')] } } }, regulated).error));
ok('nor name a role or engagement that is not theirs', /has no role/.test(normaliseTeam({ assign: { aiUseAssessment: { wizard: [] } } }, regulated).error) && /not in your solution set/.test(normaliseTeam({ assign: { aiConfidentialityExposureAssessment: {} } }, regulated).error));
const n = normaliseTeam({ assign: { aiRiskAppetite: { cro: [{ name: '  Ana ', email: ' ANA@Coastline.example ' }, { name: '', email: '' }] } } }, regulated);
ok('names are trimmed, emails lower-cased, blanks dropped', JSON.stringify(n.team.assign) === '{"aiRiskAppetite":{"cro":[{"name":"Ana","email":"ana@coastline.example"}]}}');

const inv = invitations(regulated, good(), 'Coastline Super');
const ana = inv.find(x => x.email === 'ana@coastline.example');
ok('each person gets one invitation listing every role, held', inv.length === 10 && ana.roles.length === 3 && ana.status === 'held' && /AI Use Assessment: CRO/.test(ana.text) && /Coastline Super/.test(ana.subject), inv.length);
ok('progress counts the needed client roles', JSON.stringify(progress(regulated[1], good())) === '{"filled":4,"of":4}' && progress(regulated[0], { assign: {} }).of === 5);

// Through the API
const store = memoryStore(), atlas = atlasClient(stubFetch, 'https://obligations-atlas.triodian.com');
const call = (method, path, email, body) => handle({ method, path, email, body, admins: [] }, store, atlas);
let r = await call('GET', '/api/team', 'ana@coastline.example');
ok('the team waits for saved answers', r.status === 409 && r.body.code === 'no_solution');
await call('PUT', '/api/profile', 'ana@coastline.example', { name: 'Ana', organisation: 'Coastline Super', answers: { role: 'croOrRisk', jurisdiction: 'AU', sector: 'AU-SUPERANNUATION', size: 'medium' } });
r = await call('GET', '/api/team', 'ana@coastline.example');
ok('then lists the engagements and their roles', r.status === 200 && r.body.engagements.map(e => e.assessmentType).join() === 'aiBoardDirection,aiRiskAppetite,aiUseAssessment' && r.body.engagements[0].mode === 'connected' && !r.body.canStart);
r = await call('POST', '/api/team/start', 'ana@coastline.example');
ok('an engagement cannot start with roles unfilled; the reason is given', r.status === 409 && r.body.code === 'team_not_ready' && /cannot start yet: AI Board Direction: no one is named as Chair/.test(r.body.error) && r.body.problems.length === 14);
const conflict = good(); conflict.assign.aiRiskAppetite.independent = [P('Ana', 'ana@coastline.example')];
r = await call('PUT', '/api/team', 'ana@coastline.example', conflict);
ok('a team with a conflict saves as a draft', r.status === 200 && !r.body.canStart && r.body.problems[0].code === 'independence');
r = await call('POST', '/api/team/start', 'ana@coastline.example');
ok('but an engagement cannot start with a role conflict; the reason is shown', r.status === 409 && /Ana is the independent reviewer and also CRO/.test(r.body.error) && (await store.prospectByEmail('ana@coastline.example')).status === 'prospect');
r = await call('PUT', '/api/team', 'ana@coastline.example', good());
ok('fixed, it can start', r.status === 200 && r.body.canStart && r.body.invitations.length === 10);
r = await call('POST', '/api/team/start', 'ana@coastline.example');
ok('starting hands the team to Triodian, with invitations held', r.status === 200 && r.body.started && (await store.prospectByEmail('ana@coastline.example')).status === 'team_ready' && r.body.invitations.every(x => x.status === 'held') && store._audit.some(x => x.action === 'team.start'));
r = await call('PUT', '/api/team', 'ana@coastline.example', conflict);
ok('a change after asking takes the request back', r.status === 200 && r.body.withdrew && !r.body.started && (await store.prospectByEmail('ana@coastline.example')).status === 'prospect');
await call('PUT', '/api/team', 'ana@coastline.example', good()); await call('POST', '/api/team/start', 'ana@coastline.example');
await call('PUT', '/api/profile', 'ana@coastline.example', { name: 'Ana', organisation: 'Coastline Super', answers: { role: 'croOrRisk', jurisdiction: 'AU', entityType: 'privateCompany' } });
ok('so does a change of answers that changes the engagements', (await store.prospectByEmail('ana@coastline.example')).status === 'prospect');
r = await call('PUT', '/api/team', 'ana@coastline.example', { assign: { aiUseAssessment: { assessor: [P('X', 'x@x.example')] } } });
ok('the API refuses what the client may not send', r.status === 400);
for (const p of ['/api/journey', '/api/engagement/x']) { r = await call('GET', p, 'ana@coastline.example'); ok(`still closed until provisioned: ${p}`, r.status === 403 && r.body.code === 'not_provisioned'); }
console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0);
