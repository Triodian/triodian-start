// A stand-in Atlas for the tests: the endpoints Triodian Start reads, answered by the Atlas's own core (copied by
// tools/sync-atlas.mjs), the same way src/api/app.js in obligations-atlas answers them.
import http from 'node:http';
import { ENTITY_TYPES, JURISDICTIONS, REGULATED_SECTORS, GENERAL_ENTITY_TYPES } from './atlas.js';
import { ROUTING_TABLE, solutionSet } from './solution-set.js';

export const PRACTITIONERS = [
  { firmID: 'firm-00000000000000a1', firm: 'Askew Lane Partners', roles: ['Fractional GC'], jurisdictions: ['AU'] },
  { firmID: 'firm-00000000000000b2', firm: 'Kestrel Board Advisory', roles: ['Board advisor'], jurisdictions: ['AU', 'SG'] },
];

export function table() {
  return { ...ROUTING_TABLE,
    jurisdictions: Object.entries(JURISDICTIONS).filter(([k]) => k !== 'INT').map(([code, j]) => ({ code, name: j.name, covered: j.depth === 'full' })),
    sectors: REGULATED_SECTORS.map((d) => ({ regulatedSectorID: d.regulatedSectorID, jurisdiction: d.jurisdiction, name: d.name, financiallyRegulated: !!d.financiallyRegulated, entityTypes: d.entityTypes })),
    generalEntityTypes: GENERAL_ENTITY_TYPES.map((id) => ({ id, name: ENTITY_TYPES[id] })),
    entityTypeNames: ENTITY_TYPES };
}
/** { status, body } for a path with its query, as the Atlas answers it. */
export function answer(pathAndQuery, origin = 'https://obligations-atlas.triodian.com') {
  const u = new URL(pathAndQuery, origin);
  if (u.pathname === '/api/v1/solution-set/table') return { status: 200, body: table() };
  if (u.pathname === '/api/v1/solution-set') {
    const q = Object.fromEntries(u.searchParams), list = (k) => (q[k] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const r = solutionSet({ role: q.role, entityTypes: list('entityType'), sectors: list('sector'), jurisdiction: (q.jurisdiction || '').toUpperCase() || undefined, size: q.size, prompt: q.prompt }, { atlasUrl: origin });
    return r.error ? { status: 400, body: { title: r.error, code: 'query.solutionSet' } } : { status: 200, body: r };
  }
  // The practitioner directory (task 5.4), as GET /api/v1/firms/directory answers it. The firms are made up.
  if (u.pathname === '/api/v1/firms/directory') return { status: 200, body: { format: 'triodian.practitionerDirectory/1', available: true, items: PRACTITIONERS } };
  return { status: 404, body: { title: 'No such path' } };
}
/** A fetch() for the app's Atlas client. */
export const stubFetch = async (req) => { const a = answer(new URL(req.url).pathname + new URL(req.url).search); return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } }); };

if (process.argv[1] && process.argv[1].endsWith('stub.mjs')) {
  const port = Number(process.argv[2] || 8898);
  http.createServer((req, res) => {
    if (req.url === '/healthz') { res.end('ok'); return; }
    const a = answer(req.url, `http://localhost:${port}`);
    res.writeHead(a.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(a.body));
  }).listen(port, '127.0.0.1', () => console.log('stand-in Atlas on', port));
}
