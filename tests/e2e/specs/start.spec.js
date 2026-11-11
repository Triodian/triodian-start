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
  for (const path of ['/api/team', '/api/journey']) {
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
