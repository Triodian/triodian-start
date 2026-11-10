// Storage for Triodian Start on Cloudflare D1. Prospects only: who signed up, their answers and the solution set they
// were shown. No engagement data is kept here; each engagement lives in its own app's database once provisioned.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS prospects (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', organisation TEXT NOT NULL DEFAULT '',
     answers TEXT NOT NULL DEFAULT '{}', solution TEXT, status TEXT NOT NULL DEFAULT 'prospect', client_code TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}')`,
];

const row = r => r && ({ id: r.id, email: r.email, name: r.name, organisation: r.organisation, answers: JSON.parse(r.answers || '{}'), solution: r.solution ? JSON.parse(r.solution) : null, status: r.status, clientCode: r.client_code || null, createdAt: r.created_at, updatedAt: r.updated_at });

export function d1Store(db) {
  let ready = false;
  return {
    async init() { if (ready) return; for (const s of SCHEMA) await db.prepare(s).run(); ready = true; },
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
    async insertProspect(p) { if (!P.has(p.email)) P.set(p.email, { id: p.id, email: p.email, name: '', organisation: '', answers: {}, solution: null, status: 'prospect', clientCode: null, createdAt: p.createdAt, updatedAt: p.createdAt }); return this.prospectByEmail(p.email); },
    async updateProspect(email, f, now) { Object.assign(P.get(email), structuredClone(f), { updatedAt: now }); return this.prospectByEmail(email); },
    async listProspects() { return [...P.values()].map(x => structuredClone(x)); },
    async audit(actor, action, detail, at) { A.push({ at, actor, action, detail }); },
    _set(email, f) { Object.assign(P.get(email), f); },
    _audit: A,
  };
}
