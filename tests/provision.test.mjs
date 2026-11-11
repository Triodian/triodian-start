// Provisioning on completion (development plan task 5.6): a Triodian administrator approves a request, the job file
// goes to the provisioning script, its result comes back, and the invitations go out. Run: node tests/provision.test.mjs
import { handle, atlasClient } from '../lib/core/api.js';
import { memoryStore } from '../lib/store/d1.js';
import { stubFetch } from './atlas/stub.mjs';
import { JOB_FORMAT, RESULT_FORMAT, APP_OF, CODE } from '../lib/core/provision.js';

let fails = 0; const ok = (label, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (extra && !cond ? ' → ' + extra : '')); };
const P = (name, email) => ({ name, email });
const ADMIN = 'damian.hickey@triodian.com', ANA = 'ana@coastline.example';
const store = memoryStore(), atlas = atlasClient(stubFetch, 'https://obligations-atlas.triodian.com');
const outbox = []; let failFor = '';
const sender = async m => { if (m.to === failFor) throw new Error('mailbox full'); outbox.push(m); };
const call = (method, path, email, body, opts = {}) => handle({ method, path, email, body, admins: [ADMIN], sender: opts.noSender ? null : sender }, store, atlas);

// A regulated organisation forms its team and asks to start.
await call('PUT', '/api/profile', ANA, { name: 'Ana', organisation: 'Coastline Super', answers: { role: 'croOrRisk', jurisdiction: 'AU', sector: 'AU-SUPERANNUATION', size: 'medium' } });
await call('PUT', '/api/run-by', ANA, { mode: 'triodian' });
const team = { assign: {
  aiBoardDirection: { chair: [P('Cy Chair', 'cy@coastline.example')], director: [P('Di One', 'di@coastline.example')], ceo: [P('Cleo', 'cleo@coastline.example')], gc: [P('Gia', 'gia@coastline.example')], cro: [P('Ana', ANA)] },
  aiRiskAppetite: { counsel: [P('Kim Counsel', 'kim@lawfirm.example')], cro: [P('Ana', ANA)], board: [P('Sec', 'sec@coastline.example')], independent: [P('Ira', 'ira@review.example')] },
  aiUseAssessment: { counsel: [P('Kim Counsel', 'kim@lawfirm.example')], gc: [P('Gia', 'gia@coastline.example')], cro: [P('Ana', ANA)], owner: [P('Owen', 'owen@coastline.example')], ir: [P('Ira', 'ira@review.example')] },
} };
await call('PUT', '/api/team', ANA, team);
let r = await call('GET', '/api/admin/requests', ADMIN);
ok('nothing is queued until the client asks to start', r.status === 200 && r.body.requests.length === 0);
r = await call('POST', '/api/team/start', ANA);
ok('the client asks Triodian to set the engagement up', r.status === 200 && r.body.started);

// Only a Triodian administrator sees the queue.
r = await call('GET', '/api/admin/requests', ANA);
ok('a prospect cannot see the requests', r.status === 403);
r = await call('GET', '/api/admin/requests', ADMIN);
const id = r.body.requests[0] && r.body.requests[0].id;
ok('the administrator sees the request: who, which engagements, who runs it, and what is still to fill', r.body.requests.length === 1 && r.body.requests[0].organisation === 'Coastline Super' && r.body.requests[0].runBy.mode === 'triodian'
  && r.body.requests[0].engagements.map(e => e.app).join() === 'board-direction,risk-appetite,use-assessment' && r.body.requests[0].problems.every(p => p.code === 'unfilled') && r.body.requests[0].problems.length > 0 && r.body.sending === true);
r = await call('PUT', `/api/admin/requests/${id}/approve`, ANA, {});
ok('a prospect cannot approve', r.status === 403);
r = await call('GET', `/api/admin/requests/${id}/job`, ADMIN);
ok('there is no job file before approval', r.status === 409);

// Approval: a code, the first administrator, and the delivery side's people, with no one reviewing their own work.
const T = (n) => P(n, n.toLowerCase().replace(/ /g, '.') + '@triodian.com');
const delivery = () => ({ assign: {
  aiBoardDirection: { methodOwner: [T('Mo Owner')], recorder: [T('Rae Recorder')] },
  aiRiskAppetite: { triodian: [T('Rae Recorder')] },
  aiUseAssessment: { methodOwner: [T('Mo Owner')], assessor: [T('Ash Assessor')], peer: [T('Pia Peer')], validation: [T('Val Check')], delivery: [T('Del Manager')] },
} });
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'Coastline!', admin: 'gia@coastline.example', delivery: delivery() });
ok('the client code follows the provisioning script’s rule', r.status === 400 && /client code/.test(r.body.error) && CODE.test('coastline') && !CODE.test('c') && !CODE.test('a--b') && !CODE.test('ab-'));
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'coastline', admin: 'not-an-email', delivery: delivery() });
ok('the first administrator needs an email address', r.status === 400);
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'coastline', admin: 'gia@coastline.example', delivery: { assign: {} } });
ok('it cannot be approved with the delivery side’s roles unfilled; the reason is given', r.status === 409 && r.body.code === 'team_not_ready' && /no one is named as/.test(r.body.error));
const own = delivery(); own.assign.aiUseAssessment.peer = [T('Ash Assessor')];
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'coastline', admin: 'gia@coastline.example', delivery: own });
ok('nor with someone reviewing their own work', r.status === 409 && /No one reviews their own work/.test(r.body.error));
const cross = delivery(); cross.assign.aiUseAssessment.gc = [T('Mo Owner')];
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'coastline', admin: 'gia@coastline.example', delivery: cross });
ok('the administrator cannot fill or change the client’s roles', r.status === 400 && /filled by the client/.test(r.body.error));
r = await call('PUT', `/api/admin/requests/${id}/approve`, ADMIN, { code: 'coastline', admin: 'Gia@Coastline.example', delivery: delivery() });
ok('approved: the request moves on, and the approval is recorded', r.status === 200 && r.body.request.status === 'approved' && r.body.request.provision.approvedBy === ADMIN && r.body.request.provision.admin === 'gia@coastline.example'
  && (await store.prospectByEmail(ANA)).clientCode === 'coastline' && store._audit.some(x => x.action === 'request.approve' && x.actor === ADMIN));

// While it is being set up the client cannot change the team under it.
r = await call('PUT', '/api/team', ANA, team);
ok('the client cannot change the team while Triodian sets it up', r.status === 409 && r.body.code === 'approved');
r = await call('PUT', '/api/profile', ANA, { name: 'Ana', organisation: 'Coastline Super', answers: { role: 'croOrRisk', jurisdiction: 'AU', entityType: 'privateCompany' } });
ok('nor change the engagements', r.status === 409 && (await store.prospectByEmail(ANA)).status === 'approved');
r = await call('GET', '/api/me', ANA);
ok('the client sees that it is approved, not the approval’s detail', r.body.prospect.status === 'approved' && r.body.prospect.provision.approvedAt && !('delivery' in r.body.prospect.provision) && !/triodian\.com/.test(JSON.stringify(r.body.prospect.provision)));

// The job file for tools/provision-client.mjs --job
r = await call('GET', `/api/admin/requests/${id}/job`, ADMIN);
const job = r.body;
ok('the job file names the client, the apps and the first administrator', r.status === 200 && r.download === 'triodian-job-coastline.json' && job.format === JOB_FORMAT && job.requestId === id && job.code === 'coastline' && job.name === 'Coastline Super'
  && job.apps === 'board-direction,risk-appetite,use-assessment' && job.admin === 'gia@coastline.example' && job.jurisdiction === 'AU' && job.sector === 'AU-SUPERANNUATION' && job.runBy.mode === 'triodian');
const person = e => job.people.find(x => x.email === e);
ok('each person is in it once, with their roles in each app', job.people.length === 15 && new Set(job.people.map(x => x.email)).size === 15
  && JSON.stringify(person(ANA).apps) === JSON.stringify({ 'board-direction': ['cro'], 'risk-appetite': ['cro'], 'use-assessment': ['cro'] }) && person(ANA).organisation === 'Coastline Super'
  && JSON.stringify(person('rae.recorder@triodian.com').apps) === JSON.stringify({ 'board-direction': ['recorder'], 'risk-appetite': ['triodian'] }) && person('rae.recorder@triodian.com').organisation === 'Triodian');
ok('the first administrator is marked, and is in every app', person('gia@coastline.example').admin === true && job.people.filter(x => x.admin).length === 1 && Object.keys(person('gia@coastline.example').apps).join() === 'board-direction,use-assessment,risk-appetite');
ok('the job holds the client and the team and nothing else: no token or secret', Object.keys(job).sort().join() === 'admin,approvedAt,approvedBy,apps,code,format,jurisdiction,name,people,requestId,runBy,sector' && job.people.every(x => Object.keys(x).sort().join() === 'admin,apps,email,name,organisation') && Object.values(APP_OF).length === 4);

// The result comes back
const result = { format: RESULT_FORMAT, requestId: id, code: 'coastline', people: 15, apps: job.apps.split(',').map(a => ({ id: a, url: `https://${a}.coastline.apps.triodian.com` })) };
r = await call('POST', `/api/admin/requests/${id}/invitations`, ADMIN, {});
ok('invitations wait for the apps to be set up', r.status === 409 && r.body.code === 'not_provisioned' && outbox.length === 0);
r = await call('POST', `/api/admin/requests/${id}/provisioned`, ADMIN, { ...result, code: 'other' });
ok('a result for another client is refused', r.status === 400);
r = await call('POST', `/api/admin/requests/${id}/provisioned`, ADMIN, { ...result, apps: result.apps.map((a, i) => i ? a : { id: a.id, url: 'http://insecure.example' }) });
ok('so is one with an address that is not https', r.status === 400);
r = await call('POST', `/api/admin/requests/${id}/provisioned`, ADMIN, { ...result, apps: result.apps.map((a, i) => i ? a : { id: a.id, url: 'javascript:alert(1)' }) });
ok('or not a web address at all', r.status === 400);
r = await call('POST', `/api/admin/requests/${id}/provisioned`, ANA, result);
ok('a prospect cannot mark it set up', r.status === 403);
r = await call('POST', `/api/admin/requests/${id}/provisioned`, ADMIN, result);
ok('the result marks the client provisioned, with its app addresses', r.status === 200 && r.body.request.status === 'provisioned' && r.body.request.provision.appUrls.length === 3 && r.body.request.invitations.length === 15 && r.body.request.invitations.every(i => i.status === 'held'));
r = await call('GET', '/api/me', ANA);
ok('the client now sees its apps', r.body.prospect.status === 'provisioned' && r.body.prospect.provision.apps.map(a => a.url).join() === result.apps.map(a => a.url).join());
r = await call('GET', '/api/team', ANA);
ok('and the team is now managed in each app', r.status === 409 && r.body.code === 'provisioned');

// Invitations
r = await call('POST', `/api/admin/requests/${id}/invitations`, ADMIN, {}, { noSender: true });
ok('with sending switched off nothing is sent, and it says so', r.status === 503 && r.body.code === 'sending_off' && outbox.length === 0);
failFor = 'owen@coastline.example';
r = await call('POST', `/api/admin/requests/${id}/invitations`, ADMIN, {});
ok('invitations go out, one a person; a failure is recorded, not hidden', r.status === 200 && r.body.sent === 14 && r.body.failed === 1 && outbox.length === 14 && new Set(outbox.map(m => m.to)).size === 14
  && r.body.request.invitations.find(i => i.email === 'owen@coastline.example').status === 'failed' && /mailbox full/.test(r.body.request.invitations.find(i => i.email === 'owen@coastline.example').error));
const mail = outbox.find(m => m.to === ANA);
ok('an invitation lists the person’s roles and the address of each app, and how to sign in', /Dear Ana/.test(mail.text) && /AI Board Direction: CRO\n  https:\/\/board-direction\.coastline\.apps\.triodian\.com/.test(mail.text) && /AI Use Assessment: CRO/.test(mail.text) && /one-time code/.test(mail.text) && /Coastline Super/.test(mail.subject) && !/administrator/.test(mail.text));
ok('the first administrator is told so', /You are the administrator/.test(outbox.find(m => m.to === 'gia@coastline.example').text));
ok('no "must" or "required" in the invitation', !outbox.some(m => /\b(must|required)\b/i.test(m.text + m.subject)));
failFor = '';
r = await call('POST', `/api/admin/requests/${id}/invitations`, ADMIN, {});
ok('sending again reaches only those not yet sent to', r.body.sent === 1 && outbox.length === 15 && outbox[14].to === 'owen@coastline.example');
r = await call('POST', `/api/admin/requests/${id}/invitations`, ADMIN, { again: [ANA] });
ok('one person can be sent theirs again', r.body.sent === 1 && outbox.filter(m => m.to === ANA).length === 2 && store._audit.filter(x => x.action === 'request.invitations').length === 3);
r = await call('POST', `/api/admin/requests/${id}/return`, ADMIN, { note: 'x' });
ok('a client that is set up is not sent back', r.status === 409);

// Sent back: a second organisation whose request Triodian returns with the reason.
const BO = 'bo@harbour.example';
await call('PUT', '/api/profile', BO, { name: 'Bo', organisation: 'Harbour Foods', answers: { role: 'directorOrChair', jurisdiction: 'AU', entityType: 'privateCompany', size: 'small' } });
await call('PUT', '/api/run-by', BO, { mode: 'self' });
r = await call('GET', '/api/team', BO);
const need = {}; for (const e of r.body.engagements) for (const role of e.roles.filter(x => x.side === 'client' && x.min > 0)) (need[e.assessmentType] = need[e.assessmentType] || {})[role.id] = [P(role.name + ' Person', role.id + '.' + e.assessmentType.slice(2, 6).toLowerCase() + '@harbour.example')];
r = await call('PUT', '/api/team', BO, { assign: need });
r = await call('POST', '/api/team/start', BO);
ok('a second organisation asks to start', r.status === 200 && r.body.started, JSON.stringify(r.body.problems || r.body.error));
const id2 = (await store.prospectByEmail(BO)).id;
r = await call('PUT', `/api/admin/requests/${id2}/approve`, ADMIN, { code: 'coastline', admin: BO, delivery: { assign: {} } });
ok('a client code in use is refused', r.status === 400 && /already used/.test(r.body.error));
r = await call('POST', `/api/admin/requests/${id2}/return`, ADMIN, {});
ok('sending a request back needs the reason', r.status === 400);
r = await call('POST', `/api/admin/requests/${id2}/return`, ADMIN, { note: 'The board advisor’s email bounced. Please check it and ask again.' });
ok('sent back, the request leaves the queue', r.status === 200 && (await store.prospectByEmail(BO)).status === 'prospect' && (await call('GET', '/api/admin/requests', ADMIN)).body.requests.length === 1);
r = await call('GET', '/api/team', BO);
ok('the client sees why, keeps the team, and can ask again', r.body.returned.note.startsWith('The board advisor’s email bounced') && !r.body.started && r.body.canStart);
r = await call('POST', '/api/team/start', BO);
ok('asking again clears the note', r.status === 200 && r.body.returned === null && r.body.started);
r = await call('GET', `/api/admin/requests/nope/job`, ADMIN);
ok('an unknown request is not found', r.status === 404);
console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0);
