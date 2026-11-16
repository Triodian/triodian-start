// Storage for Triodian Start on Cloudflare D1. Prospects only: who signed up, their answers and the solution set they
// were shown. No engagement data is kept here; each engagement lives in its own app's database once provisioned.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS prospects (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', organisation TEXT NOT NULL DEFAULT '',
     answers TEXT NOT NULL DEFAULT '{}', solution TEXT, status TEXT NOT NULL DEFAULT 'prospect', client_code TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // marketing: the person's choice about marketing email from Triodian, as JSON (lib/core/api.js MARKETING)
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}')`,
];

const row = r => r && ({ id: r.id, email: r.email, name: r.name, organisation: r.organisation, answers: JSON.parse(r.answers || '{}'), solution: r.solution ? JSON.parse(r.solution) : null, status: r.status, clientCode: r.client_code || null, marketing: r.marketing ? JSON.parse(r.marketing) : null, team: r.team ? JSON.parse(r.team) : null, provision: r.provision ? JSON.parse(r.provision) : null, createdAt: r.created_at, updatedAt: r.updated_at });

export function d1Store(db) {
  let ready = false;
  return {
    async init() {
      if (ready) return;
      for (const s of SCHEMA) await db.prepare(s).run();
      // Added after the first release: an existing table gets the column once (SQLite has no ADD COLUMN IF NOT EXISTS).
      try { await db.prepare('ALTER TABLE prospects ADD COLUMN marketing TEXT').run(); } catch (e) { /* already there */ }
      try { await db.prepare('ALTER TABLE prospects ADD COLUMN team TEXT').run(); } catch (e) { /* already there */ }
      try { await db.prepare('ALTER TABLE prospects ADD COLUMN provision TEXT').run(); } catch (e) { /* already there */ }
      // One client per code (penetration test 16 Nov 2026, PT-06): the database refuses a second client with a code already
      // assigned. If duplicates exist from before, the index cannot be made; approvals are refused until they are resolved.
      try { await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS prospects_client_code ON prospects (client_code) WHERE client_code IS NOT NULL').run(); this.duplicateCodes = []; }
      catch (e) { this.duplicateCodes = ((await db.prepare('SELECT client_code AS code, COUNT(*) AS n FROM prospects WHERE client_code IS NOT NULL GROUP BY client_code HAVING n > 1').all()).results || []).map(r => r.code); }
      ready = true;
    },
    /** Who holds this client code, by exact match (not a scan of the newest records). */
    async prospectByClientCode(code) { return row(await db.prepare('SELECT * FROM prospects WHERE client_code = ?').bind(code).first()); },
    /** The approval: one statement that assigns the code; the unique index makes a second claim of the same code fail.
     *  Returns { conflict: true } when another client already holds the code, else the prospect. */
    async claimClientCode(email, provision, status, clientCode, now) {
      if (this.duplicateCodes && this.duplicateCodes.length) return { conflict: true, duplicates: this.duplicateCodes };
      try { await db.prepare('UPDATE prospects SET provision = ?, status = ?, client_code = ?, updated_at = ? WHERE email = ? AND NOT EXISTS (SELECT 1 FROM prospects o WHERE o.client_code = ? AND o.email <> ?)')
        .bind(JSON.stringify(provision), status, clientCode, now, email, clientCode, email).run(); }
      catch (e) { if (/UNIQUE|constraint/i.test(String(e && e.message))) return { conflict: true }; throw e; }
      const p = await this.prospectByEmail(email);
      return p && p.clientCode === clientCode && p.status === status ? p : { conflict: true };
    },
    /** The team (task 5.5) and the status it puts the prospect in: 'prospect' while drafting, 'team_ready' once asked to start. */
    async setTeam(email, team, status, now) {
      await db.prepare('UPDATE prospects SET team = ?, status = ?, updated_at = ? WHERE email = ?').bind(team ? JSON.stringify(team) : null, status, now, email).run();
      return this.prospectByEmail(email);
    },
    /** The approval and what followed (task 5.6): lib/core/provision.js. status is approved, provisioned, or back to prospect. */
    async setProvision(email, provision, status, clientCode, now) {
      await db.prepare('UPDATE prospects SET provision = ?, status = ?, client_code = ?, updated_at = ? WHERE email = ?').bind(provision ? JSON.stringify(provision) : null, status, clientCode || null, now, email).run();
      return this.prospectByEmail(email);
    },
    async prospectById(id) { return row(await db.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first()); },
    async setMarketing(email, m, now) {
      await db.prepare('UPDATE prospects SET marketing = ?, updated_at = ? WHERE email = ?').bind(JSON.stringify(m), now, email).run();
      return this.prospectByEmail(email);
    },
    async prospectByEmail(email) { return row(await db.prepare('SELECT * FROM prospects WHERE email = ?').bind(email).first()); },
    async insertProspect(p) {
      await db.prepare('INSERT OR IGNORE INTO prospects (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(p.id, p.email, p.createdAt, p.createdAt).run();
      return this.prospectByEmail(p.email);
    },
    async updateProspect(email, f, now) {
      await db.prepare('UPDATE prospects SET name = ?, organisation = ?, answers = ?, solution = ?, updated_at = ? WHERE email = ?')
        .bind(f.name, f.organisation, JSON.stringify(f.answers), f.solution ? JSON.stringify(f.solution) : null, now, email).run();
      return this.prospectByEmail(email);
    },
    async listProspects() { return ((await db.prepare('SELECT * FROM prospects ORDER BY created_at DESC LIMIT 500').all()).results || []).map(row); },
    async audit(actor, action, detail, at) { await db.prepare('INSERT INTO audit (at, actor, action, detail) VALUES (?, ?, ?, ?)').bind(at, actor, action, JSON.stringify(detail || {})).run(); },
  };
}

/** The same store in memory, for the server tests. */
export function memoryStore() {
  const P = new Map(), A = [];
  return {
    async init() {},
    async prospectByEmail(email) { return P.has(email) ? structuredClone(P.get(email)) : null; },
    async insertProspect(p) { if (!P.has(p.email)) P.set(p.email, { id: p.id, email: p.email, name: '', organisation: '', answers: {}, solution: null, status: 'prospect', clientCode: null, marketing: null, team: null, provision: null, createdAt: p.createdAt, updatedAt: p.createdAt }); return this.prospectByEmail(p.email); },
    async prospectById(id) { const x = [...P.values()].find(v => v.id === id); return x ? structuredClone(x) : null; },
    async setProvision(email, provision, status, clientCode, now) { Object.assign(P.get(email), { provision: structuredClone(provision), status, clientCode: clientCode || null, updatedAt: now }); return this.prospectByEmail(email); },
    async prospectByClientCode(code) { const x = [...P.values()].find(v => v.clientCode === code); return x ? structuredClone(x) : null; },
    async claimClientCode(email, provision, status, clientCode, now) { if ([...P.values()].some(v => v.email !== email && v.clientCode === clientCode)) return { conflict: true }; return this.setProvision(email, provision, status, clientCode, now); },
    async setTeam(email, team, status, now) { Object.assign(P.get(email), { team: structuredClone(team), status, updatedAt: now }); return this.prospectByEmail(email); },
    async setMarketing(email, m, now) { Object.assign(P.get(email), { marketing: structuredClone(m), updatedAt: now }); return this.prospectByEmail(email); },
    async updateProspect(email, f, now) { Object.assign(P.get(email), structuredClone(f), { updatedAt: now }); return this.prospectByEmail(email); },
    async listProspects() { return [...P.values()].map(x => structuredClone(x)); },
    async audit(actor, action, detail, at) { A.push({ at, actor, action, detail }); },
    _set(email, f) { Object.assign(P.get(email), f); },
    _audit: A,
  };
}
