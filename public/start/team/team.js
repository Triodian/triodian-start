// The team stepper (development plan task 5.5): one step for each engagement in the solution set, then a last step
// that checks the whole team and asks Triodian to set the engagement up. The roles and the checks come from
// /shared/team.js, the same file the server uses, so the page and the server agree on what stops a start.
import { checkTeam, invitations, progress } from '/shared/team.js';

const main = document.getElementById('main');
const S = { v: null, assign: {}, step: 0, dirty: false, org: '' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (method, path, body) => fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  .then(r => r.json().catch(() => ({})).then(j => ({ ok: r.ok, status: r.status, body: j })))
  .catch(() => ({ ok: false, status: 0, body: { error: 'The server could not be reached. Check your connection.' } }));
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 4000); }
if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';

const engs = () => S.v.engagements.map(e => ({ assessmentType: e.assessmentType, mode: e.mode || undefined }));
const team = () => ({ assign: S.assign });
const list = (a, r) => ((S.assign[a] = S.assign[a] || {})[r] = S.assign[a][r] || []);
const problems = () => checkTeam(engs(), team());
const last = () => S.v.engagements.length;

function known() {
  const by = new Map();
  for (const roles of Object.values(S.assign)) for (const ps of Object.values(roles)) for (const p of ps) if (p.email && !by.has(p.email.toLowerCase())) by.set(p.email.toLowerCase(), p.name || '');
  document.getElementById('known').innerHTML = [...by].map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('');
  return by;
}

function nav() {
  const ps = problems();
  return `<ol class="steps-nav" id="nav">${S.v.engagements.map((e, i) => {
    const pr = progress({ assessmentType: e.assessmentType, mode: e.mode || undefined }, team()), bad = ps.filter(p => p.engagement === e.assessmentType).length;
    return `<li><button class="stepchip${S.step === i ? ' on' : ''}${!bad ? ' done' : ''}" data-step="${i}"><span class="stepno">${!bad ? '✓' : i + 1}</span><span>${esc(e.name)}<span class="mini">${pr.filled} of ${pr.of} roles filled</span></span></button></li>`;
  }).join('')}<li><button class="stepchip${S.step === last() ? ' on' : ''}" data-step="${last()}"><span class="stepno">${last() + 1}</span><span>Check and start<span class="mini">${ps.length ? ps.length + ' to fix' : 'Ready'}</span></span></button></li></ol>`;
}

function person(a, r, i, p, multi) {
  const id = `in-${a}-${r.id}-${i}`;
  return `<div class="prow"><label class="vh" for="${id}-n">${esc(r.one || r.name)} name</label><input id="${id}-n" class="in" placeholder="Name" value="${esc(p.name)}" data-a="${a}" data-r="${r.id}" data-i="${i}" data-k="name" maxlength="120" autocomplete="off">
    <label class="vh" for="${id}-e">${esc(r.one || r.name)} email</label><input id="${id}-e" class="in" type="email" placeholder="Work email" value="${esc(p.email)}" list="known" data-a="${a}" data-r="${r.id}" data-i="${i}" data-k="email" maxlength="200" autocomplete="off">
    ${multi ? `<button class="btn sm ghost" data-rm="1" data-a="${a}" data-r="${r.id}" data-i="${i}" aria-label="Remove this person">Remove</button>` : ''}</div>`;
}

function stepEngagement(e) {
  const a = e.assessmentType, client = e.roles.filter(r => r.side === 'client'), tri = e.roles.filter(r => r.side === 'triodian');
  const role = r => {
    const ps = list(a, r.id), multi = r.max > 1, rows = ps.length ? ps : [{ name: '', email: '' }];
    if (!ps.length) ps.push(rows[0]);
    const tag = r.whenGcIsCounsel ? 'Only if the GC is also counsel' : r.min > 0 ? 'Needed' : 'Optional';
    return `<section class="role" data-role="${r.id}"><div class="role-h"><h3>${esc(r.name)}</h3><span class="badge ${r.min > 0 ? 'b-aub' : 'b-grey'}">${tag}</span></div><p class="small soft">${esc(r.explain)}</p>
      ${rows.map((p, i) => person(a, r, i, p, multi && rows.length > 1)).join('')}${multi && ps.length < r.max ? `<button class="btn sm" data-add="1" data-a="${a}" data-r="${r.id}">Add another</button>` : ''}</section>`;
  };
  return `<div class="split"><div><h2 class="team-h">${esc(e.name)}${e.mode ? ` <span class="badge b-grey">${e.mode === 'connected' ? 'Connected mode' : 'Standalone mode'}</span>` : ''}</h2>
      <p class="small soft">Name the person for each role and give their work email. Someone can hold more than one role unless a check says otherwise.</p>
      <div class="roles">${client.map(role).join('')}</div>
      <section class="role tri"><div class="role-h"><h3>Filled by Triodian</h3><span class="badge b-grey">Requested when you start</span></div>
        <ul class="small">${tri.map(r => `<li><strong>${esc(r.name)}.</strong> ${esc(r.explain)}</li>`).join('')}</ul></section>
      <p class="acts"><button class="btn" data-go="${S.step - 1}" ${S.step === 0 ? 'disabled' : ''}>Back</button><button class="btn primary" id="next" data-go="${S.step + 1}">Save and continue</button></p></div>
    <aside class="facts" aria-label="Checks for this engagement"><h2>Checks</h2><div id="checks">${checks(a)}</div></aside></div>`;
}
function checks(a) {
  const ps = problems().filter(p => !a || p.engagement === a);
  return ps.length ? `<ul class="problems">${ps.map(p => `<li>${esc(p.reason)}</li>`).join('')}</ul>` : '<p class="saved" style="margin:0">Nothing to fix here.</p>';
}

function stepStart() {
  const ps = problems(), inv = invitations(engs(), team(), S.org), started = S.v.started && !S.dirty;
  const people = inv.map(x => `<tr><td>${esc(x.name || '—')}</td><td>${esc(x.email)}</td><td>${x.roles.map(r => esc(r.engagementName + ': ' + r.roleName)).join('<br>')}</td></tr>`).join('');
  return `<h2 class="team-h">Check and start</h2>
    ${started ? '<p class="msg-ok" id="started">Triodian has your team and will set up the engagement with you. You can still change the team; a change takes the request back until you ask again.</p>' : ''}
    ${ps.length ? `<section class="role bad" id="blockers"><div class="role-h"><h3>The engagement cannot start yet</h3><span class="badge b-red">${ps.length} to fix</span></div>
      <ul class="problems">${ps.map(p => `<li>${esc(p.reason)} <button class="lnk" data-step="${S.v.engagements.findIndex(e => e.assessmentType === p.engagement)}">Fix</button></li>`).join('')}</ul></section>`
      : '<p class="saved" id="ready">Every needed role is filled and every check passes.</p>'}
    <section class="role"><div class="role-h"><h3>Your people</h3><span class="badge b-grey">${inv.length}</span></div>
      ${inv.length ? `<div class="tw"><table class="ptable"><thead><tr><th>Name</th><th>Email</th><th>Roles</th></tr></thead><tbody>${people}</tbody></table></div>` : '<p class="small soft">No one is named yet.</p>'}
      <p class="small soft">Invitations are held until Triodian sets up the engagement. Each person then gets one email listing their roles, and signs in with that address.</p>
      ${inv.length ? `<details class="small"><summary>See the invitation ${esc(inv[0].name || inv[0].email)} will get</summary><pre class="invite">${esc('Subject: ' + inv[0].subject + '\n\n' + inv[0].text)}</pre></details>` : ''}</section>
    <section class="role tri"><div class="role-h"><h3>Triodian’s team</h3><span class="badge b-grey">Requested when you start</span></div><p class="small soft">Triodian names its own people for each engagement. Its peer reviewer and validation are never the assessor.</p></section>
    <p class="acts"><button class="btn" data-go="${S.step - 1}">Back</button><button class="btn primary" id="start" ${ps.length || started ? 'disabled' : ''}>Ask Triodian to set up the engagement</button></p>
    ${ps.length ? '<p class="why small" id="whynot">Fix the items above first. Each says what is wrong and where.</p>' : ''}`;
}

function render() {
  known();
  const e = S.v.engagements[S.step];
  main.innerHTML = `<div class="hero" style="margin-bottom:14px"><p class="eyebrow">Admin · Form your team</p><h1>Who does what</h1>
    <p class="lede">One step for each engagement, then a check of the whole team. An engagement starts only when every needed role is filled and no one holds roles that conflict.</p></div>
    ${nav()}${e ? stepEngagement(e) : stepStart()}`;
  window.scrollTo(0, 0);
}
const refresh = () => { const e = S.v.engagements[S.step]; const c = document.getElementById('checks'); if (c && e) c.innerHTML = checks(e.assessmentType); const n = document.getElementById('nav'); if (n) n.outerHTML = nav(); };

function clean() {
  const out = {};
  for (const [a, roles] of Object.entries(S.assign)) for (const [r, ps] of Object.entries(roles)) {
    const keep = ps.map(p => ({ name: (p.name || '').trim(), email: (p.email || '').trim().toLowerCase() })).filter(p => p.name || p.email);
    if (keep.length) (out[a] = out[a] || {})[r] = keep;
  }
  return out;
}
async function save() {
  if (!S.dirty) return true;
  const r = await api('PUT', '/api/team', { assign: clean() });
  if (!r.ok) { toast(r.body.error || 'Not saved.'); return false; }
  S.v = r.body; S.assign = structuredClone(r.body.team.assign || {}); S.dirty = false;
  if (r.body.withdrew) toast('Saved. Your request to start was taken back because the team changed; ask again when ready.');
  return true;
}
async function go(i) { if (i < 0 || i > last()) return; if (!(await save())) return; S.step = i; render(); }

main.addEventListener('input', ev => {
  const t = ev.target; if (!t.dataset || !t.dataset.k) return;
  const ps = list(t.dataset.a, t.dataset.r), p = ps[+t.dataset.i] || (ps[+t.dataset.i] = { name: '', email: '' });
  p[t.dataset.k] = t.value; S.dirty = true;
  if (t.dataset.k === 'email') { // someone already named: fill their name
    const n = known().get(t.value.trim().toLowerCase()), box = document.getElementById(t.id.replace(/-e$/, '-n'));
    if (n && box && !box.value) { box.value = n; p.name = n; }
  }
  refresh();
});
main.addEventListener('click', async ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.step != null) return go(+t.dataset.step);
  if (t.dataset.go != null) return go(+t.dataset.go);
  if (t.dataset.add) { list(t.dataset.a, t.dataset.r).push({ name: '', email: '' }); S.dirty = true; const y = scrollY; render(); scrollTo(0, y); return; }
  if (t.dataset.rm) { list(t.dataset.a, t.dataset.r).splice(+t.dataset.i, 1); S.dirty = true; const y = scrollY; render(); scrollTo(0, y); return; }
  if (t.id === 'start') {
    if (!(await save())) return;
    const r = await api('POST', '/api/team/start');
    if (!r.ok) { toast(r.body.error || 'The engagement could not start.'); const v = await api('GET', '/api/team'); if (v.ok) { S.v = v.body; render(); } return; }
    S.v = r.body; render(); toast('Sent to Triodian.');
  }
});

const [me, v] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/team')]);
if (!v.ok) main.innerHTML = `<p class="notice" role="alert">${esc(v.body.error || 'The team could not be read.')}</p><p><a class="btn" href="/start/">Back to the questions</a></p>`;
else { S.v = v.body; S.assign = structuredClone(v.body.team.assign || {}); S.org = (me.ok && me.body.prospect.organisation) || ''; S.step = v.body.started ? last() : 0; render(); }
window.TeamApp = { state: () => S };
