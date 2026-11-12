// Triodian Start (development plan tasks 5.1, 5.2, 5.3 and 5.8) through the browser and the API.
import { test, expect } from '@playwright/test';

const ctxFor = (browser, email) => browser.newContext({ extraHTTPHeaders: { 'X-Dev-User': email } });

test('the landing page is open to anyone and offers two ways in: sign up, or try a worked example with no sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Find the engagements that fit' })).toBeVisible();
  await expect(page.locator('#methods a').first()).toHaveAttribute('href', /^\/auth\/[a-z]+\?next=%2Fstart%2F$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Try a worked example first' })).toBeVisible();
  const tries = page.locator('#trylist a.trybtn');
  await expect(tries).toHaveCount(4);
  await expect(tries.first()).toHaveAttribute('href', '/auth/try?app=aiBoardDirection');
  await expect(page.locator('#tryoff')).toBeHidden();
});

test('a visitor who has not signed up can open a worked example', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: 'http://localhost:8790' }); // no X-Dev-User: the landing page's own request
  const res = await anon.get('/auth/try?app=aiRiskAppetite', { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('http://localhost:8898/apps/risk-appetite/');
  expect(res.headers()['set-cookie']).toMatch(/^tri_demo=/);
  expect((await (await anon.get('/auth/try-status')).json()).on).toBe(true);
  await anon.dispose();
});

test('each answer changes what is shown next, and the solution set follows the Atlas routing table', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'ana@coastline.example'); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('/start/');
  await expect(p.locator('#q-role')).toBeVisible();
  await expect(p.locator('#q-jurisdiction')).toHaveCount(0);
  await p.getByLabel('CRO or risk').check();
  await expect(p.locator('#q-jurisdiction')).toBeVisible();
  await expect(p.locator('#q-org')).toHaveCount(0);
  await expect(p.locator('#q-jurisdiction')).toContainText('not covered yet'); // New Zealand and the others
  await p.locator('#q-jurisdiction').getByLabel('Australia').check();
  await expect(p.locator('#q-org')).toContainText('Superannuation');
  await p.locator('#q-org').getByLabel('Superannuation', { exact: true }).check();
  // As soon as the role and organisation are known, the engagements appear, in the order the work is done.
  const eng = p.locator('.eng');
  await expect(eng).toHaveCount(3);
  await expect(eng.nth(0)).toContainText('AI Board Direction');
  await expect(eng.nth(0)).toContainText('Connected mode');
  await expect(eng.nth(1)).toContainText('AI Risk Appetite');
  await expect(eng.nth(2)).toContainText('AI Use Assessment');
  await expect(eng.nth(1)).toContainText('Your part: CRO');
  await expect(p.locator('#q-size')).toContainText('Lite scope');
  await p.getByLabel('100 to 1,000 staff').check();
  await expect(eng.nth(2)).toContainText('Scope: Lite');
  // Australian prompts only
  await expect(p.locator('#q-prompt')).toContainText('APRA');
  await expect(p.locator('#q-prompt')).not.toContainText('MAS');
  await p.getByLabel('APRA’s letter on AI (30 April 2026)').check();
  await expect(eng.nth(0)).toContainText('Start here');
  await expect(p.locator('#brief')).toHaveAttribute('href', /#\/brief\/.*AU-SUPERANNUATION/);
  await expect(p.locator('.eng a', { hasText: 'Try the worked example' })).toHaveCount(3);
  // Save, then the answers are there on a fresh visit.
  await p.fill('#f-name', 'Ana Cruz'); await p.fill('#f-org', 'Coastline Super');
  await expect(p.locator('aside.facts')).toContainText('Superannuation');
  await expect(p.locator('aside.facts')).toContainText('Financially regulated');
  await p.click('#save');
  await expect(p.locator('#saved')).toHaveText('Saved.');
  await p.reload();
  await expect(p.locator('.eng')).toHaveCount(3);
  await expect(p.getByLabel('APRA’s letter on AI (30 April 2026)')).toBeChecked();
  await expect(p.locator('#f-org')).toHaveValue('Coastline Super');
  // Singapore: the MAS prompt, not APRA's, and a new organisation choice
  await p.locator('#q-jurisdiction').getByLabel('Singapore').check();
  await expect(p.locator('#q-size')).toHaveCount(0);
  await expect(p.locator('.eng')).toHaveCount(0);
  await p.locator('#q-org').getByLabel('Private company').check();
  await expect(p.locator('.eng')).toHaveCount(2);
  await expect(p.locator('.eng').nth(0)).toContainText('Standalone mode');
  await p.getByLabel('Fewer than 100 staff').check();
  await expect(p.locator('#q-prompt')).toContainText('MAS');
  await expect(p.locator('#q-prompt')).not.toContainText('APRA');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('nothing else is reachable until provisioned, and a prospect cannot see other sign-ups', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'ben@harrow.example'), r = ctx.request;
  expect((await (await r.get('/api/me')).json()).prospect.status).toBe('prospect');
  for (const path of ['/api/journey', '/api/engagement/x']) {
    const res = await r.get(path); expect(res.status()).toBe(403); expect((await res.json()).code).toBe('not_provisioned');
  }
  expect((await r.get('/api/admin/prospects')).status()).toBe(403);
  const bad = await r.put('/api/profile', { data: { answers: { role: 'astronaut' } } });
  expect(bad.status()).toBe(400); expect((await bad.json()).error).toMatch(/Unknown role/);
  const admin = await (await ctxFor(browser, 'damian.hickey@triodian.com')).request.get('/api/admin/prospects');
  expect(admin.status()).toBe(200);
  expect((await admin.json()).prospects.map(x => x.email)).toContain('ben@harrow.example');
  await ctx.close();
});

test('try first opens the worked example as the demo account, without inviting anyone', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'ana@coastline.example');
  const res = await ctx.request.get('/auth/try?app=aiUseAssessment', { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('http://localhost:8898/apps/use-assessment/');
  expect(res.headers()['set-cookie']).toMatch(/^tri_demo=[^;]+; Path=\/; HttpOnly/);
  const no = await ctx.request.get('/auth/try?from=start&app=somethingElse', { maxRedirects: 0 });
  expect(no.headers()['location']).toBe('/start/?try=unknown');
  await ctx.close();
});

test('the home page offers the ways to sign in set up on the site, each straight to its provider', async ({ page, request }) => {
  await page.goto('/');
  const b = page.locator('#methods a');
  await expect(b).toHaveCount(3);
  await expect(b.nth(0)).toHaveText('Continue with Google');
  await expect(b.nth(0)).toHaveAttribute('href', '/auth/google?next=%2Fstart%2F');
  await expect(b.nth(1)).toHaveText('Continue with GitHub');
  await expect(b.nth(2)).toHaveText('Email me a one-time code');
  // The shared sign-in code sends people to /login; Start sends them home with the same message and destination.
  const l = await request.get('/login?out=1', { maxRedirects: 0 });
  expect(l.status()).toBe(303); expect(l.headers()['location']).toBe('/?out=1');
  await page.goto('/login?out=1');
  await expect(page.locator('#m-out')).toBeVisible();
  // Access proves the email on each path (simulated here); Start then starts the same session as for email.
  const g = await request.get('/auth/google?next=%2Fstart%2F', { maxRedirects: 0 });
  expect(g.status()).toBe(303);
  expect(g.headers()['location']).toBe('/start/');
  expect(g.headers()['set-cookie']).toMatch(/^tri_session=/);
  expect((await request.get('/auth/apple', { maxRedirects: 0 })).status()).toBe(404); // not a way to sign in
});

test('marketing email is opt-in: unticked to start, saved when ticked, and the person can untick it', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'dee@marketing.example'); const p = await ctx.newPage();
  await p.goto('/start/');
  const box = p.locator('#mkt');
  await expect(box).not.toBeChecked();
  await expect(p.locator('#marketing')).toContainText('Send me news, guidance and event invitations from Triodian by email');
  await box.check();
  await expect(p.locator('#mkt-note')).toContainText('You opted in on');
  const admin = await (await ctxFor(browser, 'damian.hickey@triodian.com')).request.get('/api/admin/marketing?format=csv');
  expect(admin.headers()['content-type']).toMatch(/text\/csv/);
  expect(await admin.text()).toContain('dee@marketing.example');
  await p.reload();
  await expect(p.locator('#mkt')).toBeChecked();
  await p.locator('#mkt').uncheck();
  await expect(p.locator('#mkt-note')).toContainText('not on Triodian’s mailing list');
  await ctx.close();
});

// The team stepper (tasks 5.4 and 5.5): who runs it, a step for each engagement, live checks, and no start while a role conflicts.
test('the team stepper fills each engagement, shows a conflict with its reason, and starts only once it is fixed', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'tess@harbour.example'); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  expect((await ctx.request.get('/api/team')).status()).toBe(409); // no saved answers yet
  await ctx.request.put('/api/profile', { data: { name: 'Tess', organisation: 'Harbour Foods', answers: { role: 'inHouseGC', jurisdiction: 'AU', entityType: 'privateCompany', size: 'small', prompt: 'deal' } } });
  await p.goto('/start/');
  await p.click('#team-link');
  await expect(p).toHaveURL(/\/start\/team\/$/);
  // First: who runs it (task 5.4). Someone serving themselves can choose a registered practitioner from the Atlas directory.
  await expect(p.locator('.team-h')).toHaveText('Who runs it');
  await expect(p.locator('#next')).toBeDisabled();
  await expect(p.locator('#checks')).toContainText('Choose who runs the engagement.');
  await expect(p.locator('#who .pick')).toHaveCount(3);
  await p.check('input[name="mode"][value="practitioner"]');
  await expect(p.locator('#next')).toBeDisabled(); // a practitioner, but which one
  await expect(p.locator('#firms .pick')).toHaveCount(2);
  await expect(p.locator('#firms')).toContainText('Board advisor · AU, SG');
  await p.check('input[name="firm"][value="firm-00000000000000b2"]');
  await expect(p.locator('#checks')).toContainText('Nothing to fix here.');
  await p.click('#next');
  expect((await (await ctx.request.get('/api/me')).json()).prospect.team.runBy).toMatchObject({ mode: 'practitioner', firm: 'Kestrel Board Advisory' });
  await expect(p.locator('#nav')).toContainText('With Kestrel Board Advisory');
  // Step 1: AI Board Direction, standalone: no CRO role
  await expect(p.locator('.team-h')).toContainText('AI Board Direction');
  await expect(p.locator('.team-h')).toContainText('Standalone mode');
  await expect(p.locator('[data-role="cro"]')).toHaveCount(0);
  await expect(p.locator('#checks')).toContainText('no one is named as Chair');
  const fill = async (role, i, name, email) => { await p.fill(`#in-${role}-${i}-n`, name); await p.fill(`#in-${role}-${i}-e`, email); };
  await fill('aiBoardDirection-chair', 0, 'Cy Chair', 'cy@harbour.example');
  await expect(p.locator('#checks')).not.toContainText('Chair');
  await fill('aiBoardDirection-director', 0, 'Di One', 'di@harbour.example');
  await p.locator('[data-role="director"] [data-add]').click();
  await fill('aiBoardDirection-director', 1, 'Dov Two', 'dov@harbour.example');
  await fill('aiBoardDirection-ceo', 0, 'Cleo', 'cleo@harbour.example');
  await fill('aiBoardDirection-gc', 0, 'Tess', 'tess@harbour.example');
  await expect(p.locator('#checks')).toContainText('Nothing to fix here.');
  await expect(p.locator('.role.tri')).toContainText('Recorder');
  await p.click('#next');
  // Step 2: the confidentiality assessment. The GC is also counsel, and the checker is also the matter lead: two conflicts.
  await expect(p.locator('.team-h')).toContainText('AI Confidentiality Exposure Assessment');
  await fill('aiConfidentialityExposureAssessment-counsel', 0, 'Tess', 'tess@harbour.example');
  await p.fill('#in-aiConfidentialityExposureAssessment-gc-0-e', 'tess@harbour.example');
  await expect(p.locator('#in-aiConfidentialityExposureAssessment-gc-0-n')).toHaveValue('Tess'); // someone already named
  await fill('aiConfidentialityExposureAssessment-dealLead', 0, 'Milo', 'milo@harbour.example');
  await fill('aiConfidentialityExposureAssessment-tenantOwner', 0, 'Tia', 'tia@harbour.example');
  await fill('aiConfidentialityExposureAssessment-checker', 0, 'Milo', 'milo@harbour.example');
  await expect(p.locator('#checks')).toContainText('Tess is both the GC and counsel. Two people agree the matter profile, so name a second approver');
  await expect(p.locator('#checks')).toContainText('Milo is the independent checker and also Matter team lead');
  await p.click('#next');
  // Last step: it cannot start, and says why
  await expect(p.locator('.team-h')).toHaveText('Check and start');
  await expect(p.locator('#start')).toBeDisabled();
  await expect(p.locator('#blockers')).toContainText('The engagement cannot start yet');
  await expect(p.locator('#blockers')).toContainText('The reviewer holds no other role, so the check stays independent.');
  const refused = await ctx.request.post('/api/team/start');
  expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe('team_not_ready'); // the server refuses too
  // Fix both and start
  await p.locator('#blockers .lnk').first().click();
  await fill('aiConfidentialityExposureAssessment-executive', 0, 'Cleo', 'cleo@harbour.example');
  await fill('aiConfidentialityExposureAssessment-checker', 0, 'Chen Checker', 'chen@checkers.example');
  await expect(p.locator('#checks')).toContainText('Nothing to fix here.');
  await p.click('#next');
  await expect(p.locator('#ready')).toBeVisible();
  await expect(p.locator('.ptable tbody tr')).toHaveCount(8);
  await expect(p.locator('.ptable')).toContainText('AI Board Direction: General counsel');
  await expect(p.locator('#runby')).toContainText('With Kestrel Board Advisory');
  await expect(p.locator('.invite')).toBeHidden();
  await p.click('#start');
  await expect(p.locator('#started')).toContainText('Triodian has your team');
  expect((await (await ctx.request.get('/api/me')).json()).prospect.status).toBe('team_ready');
  await p.goto('/start/');
  await expect(p.locator('#team-link')).toHaveText('Admin');
  await expect(p.locator('#team')).toHaveCount(0); // no team step on the questions page
  expect(errs).toEqual([]);
  await ctx.close();
});

// Management's roles (development plan tasks 7.5 and 7.7): a CIO signs up, the two roles are optional in the team
// step, and whoever supplies the inventory or the evidence is not the independent reviewer of any engagement in the set.
test('a CIO signs up: the technology owner and the AI governance team are optional, and never the independent reviewer', async ({ browser }) => {
  const ctx = await ctxFor(browser, 'tess.cio@meridian.example'); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('/start/');
  await expect(p.locator('body')).toContainText('CIO, CTO or AI governance lead');   // in the who-you-are question, from the Atlas routing table
  await ctx.request.put('/api/profile', { data: { name: 'Tess', organisation: 'Meridian Insurance', answers: { role: 'technologyLead', jurisdiction: 'AU', entityType: 'generalInsurer', size: 'large' } } });
  await ctx.request.put('/api/run-by', { data: { mode: 'self' } });
  const view = await (await ctx.request.get('/api/team')).json();
  expect(view.engagements.map(e => e.assessmentType).sort()).toEqual(['aiBoardDirection', 'aiRiskAppetite', 'aiUseAssessment']);
  // every needed role filled, the two new roles left empty: the team is complete without them
  const assign = {}; for (const e of view.engagements) for (const r of e.roles.filter(x => x.side === 'client' && x.min > 0)) (assign[e.assessmentType] = assign[e.assessmentType] || {})[r.id] = [{ name: r.name + ' Person', email: `${r.id}@meridian.example` }];
  for (const a of ['aiRiskAppetite', 'aiUseAssessment']) assign[a][a === 'aiUseAssessment' ? 'ir' : 'independent'] = [{ name: 'Ira Reviewer', email: 'ira@review.example' }];
  expect((await ctx.request.put('/api/team', { data: { assign } })).status()).toBe(200);
  await p.goto('/start/team/');
  const step = name => p.locator('#nav .stepchip', { hasText: name }).click();
  const fill = async (role, i, name, email) => { await p.fill(`#in-${role}-${i}-n`, name); await p.fill(`#in-${role}-${i}-e`, email); };
  await step('Check and start');
  await expect(p.locator('#ready')).toBeVisible();
  // AI Board Direction: both roles are offered as optional, each with its explanation
  await step('AI Board Direction');
  for (const r of ['technologyOwner', 'aiGovernance']) await expect(p.locator(`[data-role="${r}"] .badge`)).toHaveText('Optional');
  await expect(p.locator('[data-role="technologyOwner"]')).toContainText('One person, usually the CIO');
  await expect(p.locator('[data-role="aiGovernance"]')).toContainText('Propose no position');
  await expect(p.locator('[data-role="technologyOwner"] [data-add]')).toHaveCount(0);   // one person holds it
  await fill('aiBoardDirection-technologyOwner', 0, 'Tess', 'tess.cio@meridian.example');
  await fill('aiBoardDirection-aiGovernance', 0, 'Gov One', 'gov1@meridian.example');
  await p.locator('[data-role="aiGovernance"] [data-add]').click();
  await fill('aiBoardDirection-aiGovernance', 1, 'Ira Reviewer', 'ira@review.example');   // the reviewer of the other two engagements
  await expect(p.locator('#checks')).toContainText('Nothing to fix here.');              // nothing wrong in this engagement alone
  // AI Use Assessment: the same roles, and a team member cannot also be its independent reviewer
  await step('AI Use Assessment');
  await expect(p.locator('#checks')).toContainText('Ira Reviewer is the independent reviewer and also AI governance team in AI Board Direction. A person who supplies the inventory, the evidence or the positions does not review them.');
  await expect(p.locator('[data-role="technologyOwner"]')).toContainText('Sees the hand-over and what counsel releases, not the rest of the assessment');
  await fill('aiUseAssessment-technologyOwner', 0, 'Tess', 'tess.cio@meridian.example');
  await fill('aiUseAssessment-aiGovernance', 0, 'Gov One', 'gov1@meridian.example');
  // the start is refused, with the reason, in the page and the API
  await step('Check and start');
  await expect(p.locator('#start')).toBeDisabled();
  await expect(p.locator('#blockers')).toContainText('does not review them');
  const refused = await ctx.request.post('/api/team/start');
  expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe('team_not_ready');
  // fix it: someone else is the second member of the team
  await step('AI Board Direction');
  await fill('aiBoardDirection-aiGovernance', 1, 'Gov Two', 'gov2@meridian.example');
  await step('Check and start');
  await expect(p.locator('#ready')).toBeVisible();
  await expect(p.locator('.ptable')).toContainText('AI Board Direction: Technology owner');
  await expect(p.locator('.ptable')).toContainText('AI Use Assessment: AI governance team');
  await p.click('#start');
  await expect(p.locator('#started')).toContainText('Triodian has your team');
  const team = (await (await ctx.request.get('/api/me')).json()).prospect.team.assign;
  expect(team.aiBoardDirection.technologyOwner[0].email).toBe('tess.cio@meridian.example');
  expect(team.aiBoardDirection.aiGovernance.map(x => x.email)).toEqual(['gov1@meridian.example', 'gov2@meridian.example']);
  expect(team.aiUseAssessment.aiGovernance[0].email).toBe('gov1@meridian.example');
  expect(errs).toEqual([]);
  await ctx.close();
});

// Provisioning on completion (task 5.6): a Triodian administrator approves the request, takes the job file to the
// provisioning script, brings its result back, and the client sees its apps. Sending is off on this test server.
test('a Triodian administrator approves a request, sets it up from the job file, and the client then sees its apps', async ({ browser }) => {
  const ADMIN = 'damian.hickey@triodian.com';
  const client = await ctxFor(browser, 'zed@quay.example');
  await client.request.put('/api/profile', { data: { name: 'Zed', organisation: 'Quay Logistics', answers: { role: 'directorOrChair', jurisdiction: 'AU', entityType: 'privateCompany', size: 'small' } } });
  await client.request.put('/api/run-by', { data: { mode: 'self' } });
  const view = await (await client.request.get('/api/team')).json();
  const assign = {}; for (const e of view.engagements) for (const r of e.roles.filter(x => x.side === 'client' && x.min > 0)) (assign[e.assessmentType] = assign[e.assessmentType] || {})[r.id] = [{ name: r.name + ' Person', email: `${r.id}.${e.assessmentType.slice(2, 6).toLowerCase()}@quay.example` }];
  await client.request.put('/api/team', { data: { assign } });
  expect((await client.request.post('/api/team/start')).status()).toBe(200);
  const cp = await client.newPage();
  await cp.goto('/start/');
  await expect(cp.locator('#standing')).toContainText('Triodian has your request');
  await expect(cp.locator('#requests-link')).toBeHidden(); // not an administrator
  expect((await client.request.get('/api/admin/requests')).status()).toBe(403);

  const admin = await ctxFor(browser, ADMIN); const p = await admin.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('/start/');
  await p.click('#requests-link');
  await expect(p).toHaveURL(/\/start\/requests\/$/);
  const row = p.locator('#queue tr', { hasText: 'Quay Logistics' });
  await expect(row).toContainText('Waiting for approval');
  await expect(row).toContainText('The client’s own people');
  await row.locator('[data-open]').click();
  // 1. Approve: a code, the first administrator (the person who asked, when the client runs it itself), the delivery side.
  await expect(p.locator('#f-admin')).toHaveValue('zed@quay.example');
  await expect(p.locator('#do-approve')).toBeDisabled();
  await expect(p.locator('#problems')).toContainText('Give the client a code');
  await expect(p.locator('#problems')).toContainText('no one is named as Method owner');
  await p.fill('#f-code', 'quay');
  const ids = await p.locator('#approve input[data-k="email"]').evaluateAll(els => els.map(e => e.id));
  for (const [i, id] of ids.entries()) { await p.fill('#' + id.replace(/-e$/, '-n'), 'Delivery ' + (i + 1)); await p.fill('#' + id, `delivery${i + 1}@triodian.com`); }
  await expect(p.locator('#problems')).toContainText('Every role is filled and every check passes.');
  await expect(p.locator('#job')).toHaveCount(0); // no job before approval
  await p.click('#do-approve');
  await expect(p.locator('#approve .badge')).toContainText('Approved');
  await expect(p.locator('#f-code')).toBeDisabled();
  // 2. The job file, and the result that comes back from the provisioning script.
  await expect(p.locator('#job pre')).toHaveText('node tools/provision-client.mjs --job triodian-job-quay.json');
  const res = await admin.request.get(await p.locator('#get-job').getAttribute('href'));
  expect(res.headers()['content-disposition']).toContain('triodian-job-quay.json');
  const job = await res.json();
  expect(job).toMatchObject({ format: 'triodian.provisionJob/1', code: 'quay', name: 'Quay Logistics', admin: 'zed@quay.example', apps: 'board-direction,confidentiality' });
  expect(job.people.find(x => x.email === 'zed@quay.example')).toMatchObject({ admin: true });
  await cp.goto('/start/');
  await expect(cp.locator('#standing')).toContainText('Triodian is setting up your engagement');
  const result = { format: 'triodian.provisionResult/1', requestId: job.requestId, code: 'quay', people: job.people.length, apps: job.apps.split(',').map(id => ({ id, url: `https://${id}.quay.apps.example.com` })) };
  await p.setInputFiles('#result', { name: 'triodian-job-quay.result.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...result, code: 'someone-else' })) });
  await expect(p.locator('#toast')).toContainText('another request');
  await p.setInputFiles('#result', { name: 'triodian-job-quay.result.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result)) });
  await expect(p.locator('#apps a')).toHaveCount(2);
  await expect(p.locator('#apps')).toContainText('board-direction.quay.apps.example.com');
  // 3. The invitations: one a person, held; with sending off the page says so and sends nothing.
  await expect(p.locator('#invtable tbody tr')).toHaveCount(job.people.length);
  await expect(p.locator('#invtable')).toContainText('Held');
  await expect(p.locator('#sending-off')).toBeVisible();
  await expect(p.locator('#do-send')).toBeDisabled();
  expect((await admin.request.post(`/api/admin/requests/${job.requestId}/invitations`, { data: {} })).status()).toBe(503);
  await p.click('#invites summary');
  await expect(p.locator('#invites .invite')).toContainText('https://board-direction.quay.apps.example.com');
  // The client now sees its apps.
  await cp.goto('/start/');
  await expect(cp.locator('#standing')).toContainText('Your engagement is set up');
  await expect(cp.locator('#myapps a')).toHaveCount(2);
  await expect(cp.locator('#myapps a').first()).toHaveAttribute('href', 'https://board-direction.quay.apps.example.com');
  expect(errs).toEqual([]);
  await client.close(); await admin.close();
});

// The home page's two cards read top to bottom. (A style added for another page once shared their class name and laid
// each card's parts out side by side.)
test('the home page\'s two ways in are laid out as cards, each read top to bottom', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  await p.goto('/');
  const cards = p.locator('.choices > .choice');
  await expect(cards).toHaveCount(2);
  for (const i of [0, 1]) {
    const card = cards.nth(i);
    expect(await card.evaluate(el => getComputedStyle(el).display)).toBe('block');
    const h = await card.locator('h2').boundingBox(), no = await card.locator('.choice-no').boundingBox(), box = await card.boundingBox();
    expect(h.y).toBeGreaterThanOrEqual(no.y + no.height - 1); // the heading sits under the label, not beside it
    expect(h.width).toBeGreaterThan(box.width * 0.6);          // and runs across the card
  }
  await ctx.close();
});
