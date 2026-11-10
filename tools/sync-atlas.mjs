// Copies the Atlas core (the routing table and the matter brief, development plan task 5.3) into tests/atlas, for the
// tests' stand-in Atlas. The app itself never uses this copy: it asks the Atlas over HTTP.
// usage: node tools/sync-atlas.mjs [../obligations-atlas]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const src = path.resolve(process.argv[2] || '../obligations-atlas');
for (const f of ['atlas.js', 'sectors.js', 'solution-set.js']) fs.copyFileSync(path.join(src, 'src/core', f), path.join('tests/atlas', f));
let commit = ''; try { commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim(); } catch (e) {}
fs.writeFileSync('tests/atlas/VENDORED.json', JSON.stringify({ from: 'Triodian/obligations-atlas src/core', commit, at: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log('tests/atlas updated from', src, commit);
