// Triodian Start (development plan tasks 5.1, 5.2, 5.3 and 5.8) through the browser and the API.
import { test, expect } from '@playwright/test';

const ctxFor = (browser, email) => browser.newContext({ extraHTTPHeaders: { 'X-Dev-User': email } });

test('the landing page is open to anyone and offers sign-up by email', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find the engagements that fit your organisation');
  await expect(page.locator('#go')).toHaveAttribute('href', '/auth/email?next=%2Fstart%2F');
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
  const no = await ctx.request.get('/auth/try?app=somethingElse', { maxRedirects: 0 });
  expect(no.headers()['location']).toMatch(/try=unknown/);
  await ctx.close();
});
