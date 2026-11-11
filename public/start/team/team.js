// The team stepper (development plan tasks 5.4 and 5.5): who runs the engagement, one step for each engagement in the
// solution set, then a last step that checks the whole team and asks Triodian to set the engagement up. The roles and the checks come from
// /shared/team.js, the same file the server uses, so the page and the server agree on what stops a start.
import { checkTeam, checkRunBy, invitations, progress } from '/shared/team.js';

const main = document.getElementById('main');
const S = { v: null, assign: {}, step: 0, dirty: false, org: '', who: { mode: '', firmID: '' }, whoDirty: false };
const WHO = -1; // the first step: who runs it
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (method, path, body) => fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  .then(r => r.json().catch(() => ({})).then(j => ({ ok: r.ok, status: r.status, body: j })))
  .catch(() => ({ ok: false, status: 0, body: { error: 'The server could not be reached. Check your connection.' } }));
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 4000); }
if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';

const engs = () => S.v.engagements.map(e => ({ assessmentType: e.assessmentType, mode: e.mode || undefined }));
const team = () => ({ assign: S.assign });
const list = (a, r) => ((S.assign[a] = S.assign[a] || {})[r] = S.assign[a][r] || []);
const runByNow = () => (S.whoDirty ? (S.who.mode ? { mode: S.who.mode, firmID: S.who.firmID } : null) : S.v.runBy);
const problems = () => [...checkRunBy({ runBy: runByNow() }, S.v.practitioners), ...checkTeam(engs(), team())];
const runByName = rb => { if (!rb) return ''; const o = S.v.runByOptions.find(x => x.id === rb.mode); return rb.mode === 'practitioner' ? 'With ' + (rb.firm || 'a registered practitioner') : o ? o.name : ''; };
const last = () => S.v.engagements.length;

function known() {
  const by = new Map();
  for (const roles of Object.values(S.assign)) for (const ps of Object.values(roles)) for (const p of ps) if (p.email && !by.has(p.email.toLowerCase())) by.set(p.email.toLowerCase(), p.name || '');
  document.getElementById('known').innerHTML = [...by].map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('');
  return by;
}

function nav() {
  const ps = problems();
  const whoBad = ps.some(p => p.engagement === null);
  return `<ol class="steps-nav" id="nav"><li><button class="stepchip${S.step === WHO ? ' on' : ''}${!whoBad ? ' done' : ''}" data-step="${WHO}"><span class="stepno">${!whoBad ? '✓' : '•'}</span><span>Who runs it<span class="mini">${esc(whoBad ? 'To choose' : runByName(S.v.runBy) || 'Chosen')}</span></span></button></li>${S.v.engagements.map((e, i) => {
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
      <p class="acts"><button class="btn" data-go="${S.step - 1}">Back</button><button class="btn primary" id="next" data-go="${S.step + 1}">Save and continue</button></p></div>
    <aside class="facts" aria-label="Checks for this engagement"><h2>Checks</h2><div id="checks">${checks(a)}</div></aside></div>`;
}
// Who runs it (task 5.4): the organisation's own people, a registered practitioner from the Atlas directory, or Triodian.
function stepWho() {
  const dir = S.v.practitioners || { available: false, items: [] }, w = S.who;
  const firm = f => `<label class="pick sub${w.firmID === f.firmID ? ' on' : ''}"><input type="radio" name="firm" value="${esc(f.firmID)}"${w.firmID === f.firmID ? ' checked' : ''}><span><strong>${esc(f.firm)}</strong>
      <span class="small soft">${esc([f.roles.join(', '), f.jurisdictions.join(', ')].filter(Boolean).join(' · ') || 'Registered practitioner')}</span></span></label>`;
  const firms = dir.items.length ? `<div class="firms" id="firms" role="radiogroup" aria-label="Registered practitioners">${dir.items.map(firm).join('')}
      <p class="small soft" style="margin:0">These firms are registered with Triodian and asked to be listed. Triodian does not pass your details to a firm until it sets the engagement up with you.</p></div>`
    : `<p class="small soft firms" id="nofirms">${dir.available === false ? 'The list of registered practitioners could not be read just now. Try again shortly, or choose another way.' : 'No registered practitioner is listed yet. Choose another way, or ask Triodian to suggest one.'}</p>`;
  const opt = o => `<label class="pick${w.mode === o.id ? ' on' : ''}"><input type="radio" name="mode" value="${o.id}"${w.mode === o.id ? ' checked' : ''}><span><strong>${esc(o.name)}</strong><span class="small soft">${esc(o.explain)}</span></span></label>
      ${o.id === 'practitioner' && w.mode === 'practitioner' ? firms : ''}`;
  const ready = w.mode && (w.mode !== 'practitioner' || w.firmID);
  return `<div class="split"><div><h2 class="team-h">Who runs it</h2>
      <p class="small soft">One choice for your engagements. You can change it until Triodian sets the engagement up.</p>
      <div class="wholist" id="who" role="radiogroup" aria-label="Who runs the engagement">${S.v.runByOptions.map(opt).join('')}</div>
      <p class="acts"><a class="btn" href="/start/">Back to the questions</a><button class="btn primary" id="next" data-go="0" ${ready ? '' : 'disabled'}>Save and continue</button></p></div>
    <aside class="facts" aria-label="Checks for this step"><h2>Checks</h2><div id="checks">${checks(null)}</div></aside></div>`;
}
function checks(a) {
  const ps = problems().filter(p => a === undefined || p.engagement === a);
  return ps.length ? `<ul class="problems">${ps.map(p => `<li>${esc(p.reason)}</li>`).join('')}</ul>` : '<p class="saved" style="margin:0">Nothing to fix here.</p>';
}

function stepStart() {
  const ps = problems(), inv = invitations(engs(), team(), S.org), started = S.v.started && !S.dirty;
  const people = inv.map(x => `<tr><td>${esc(x.name || '—')}</td><td>${esc(x.email)}</td><td>${x.roles.map(r => esc(r.engagementName + ': ' + r.roleName)).join('<br>')}</td></tr>`).join('');
  return `<h2 class="team-h">Check and start</h2>
    ${S.v.status === 'approved' ? '<p class="msg-ok" id="approved">Triodian is setting up your engagement with this team. To change it now, ask Triodian.</p>' : ''}
    ${S.v.returned ? `<section class="role bad" id="returned"><div class="role-h"><h3>Triodian sent this back</h3></div><p style="margin:0">${esc(S.v.returned.note)}</p><p class="small soft">Change what is needed, then ask again.</p></section>` : ''}
    ${started ? '<p class="msg-ok" id="started">Triodian has your team and will set up the engagement with you. You can still change the team; a change takes the request back until you ask again.</p>' : ''}
    ${ps.length ? `<section class="role bad" id="blockers"><div class="role-h"><h3>The engagement cannot start yet</h3><span class="badge b-red">${ps.length} to fix</span></div>
      <ul class="problems">${ps.map(p => `<li>${esc(p.reason)} <button class="lnk" data-step="${p.engagement === null ? WHO : S.v.engagements.findIndex(e => e.assessmentType === p.engagement)}">Fix</button></li>`).join('')}</ul></section>`
      : '<p class="saved" id="ready">Every needed role is filled and every check passes.</p>'}
    <section class="role" id="runby"><div class="role-h"><h3>Who runs it</h3><button class="btn sm" data-step="${WHO}">Change</button></div>
      <p style="margin:0">${S.v.runBy ? esc(runByName(S.v.runBy)) : '<span class="soft">Not chosen yet.</span>'}</p>
      ${S.v.runBy && S.v.runBy.mode === 'practitioner' ? '<p class="small soft">Triodian introduces you to the firm when it sets the engagement up.</p>' : ''}</section>
    <section class="role"><div class="role-h"><h3>Your people</h3><span class="badge b-grey">${inv.length}</span></div>
      ${inv.length ? `<div class="tw"><table class="ptable"><thead><tr><th>Name</th><th>Email</th><th>Roles</th></tr></thead><tbody>${people}</tbody></table></div>` : '<p class="small soft">No one is named yet.</p>'}
      <p class="small soft">Invitations are held until Triodian sets up the engagement. Each person then gets one email listing their roles, and signs in with that address.</p>
      ${inv.length ? `<details class="small"><summary>See the invitation ${esc(inv[0].name || inv[0].email)} will get</summary><pre class="invite">${esc('Subject: ' + inv[0].subject + '\n\n' + inv[0].text)}</pre></details>` : ''}</section>
    <section class="role tri"><div class="role-h"><h3>Triodian’s team</h3><span class="badge b-grey">Requested when you start</span></div><p class="small soft">Triodian names its own people for each engagement. Its peer reviewer and validation are never the assessor.</p></section>
    <p class="acts"><button class="btn" data-go="${S.step - 1}">Back</button><button class="btn primary" id="start" ${ps.length || started || S.v.status === 'approved' ? 'disabled' : ''}>Ask Triodian to set up the engagement</button></p>
    ${ps.length ? '<p class="why small" id="whynot">Fix the items above first. Each says what is wrong and where.</p>' : ''}`;
}

function render() {
  known();
  const e = S.v.engagements[S.step];
  main.innerHTML = `<div class="hero" style="margin-bottom:14px"><p class="eyebrow">Admin · Form your team</p><h1>Who does what</h1>
    <p class="lede">One step for each engagement, then a check of the whole team. An engagement starts only when every needed role is filled and no one holds roles that conflict.</p></div>
    ${nav()}${S.step === WHO ? stepWho() : e ? stepEngagement(e) : stepStart()}`;
  window.scrollTo(0, 0);
}
const refresh = () => { const e = S.v.engagements[S.step]; const c = document.getElementById('checks'); if (c && (e || S.step === WHO)) c.innerHTML = checks(e ? e.assessmentType : null); const n = document.getElementById('nav'); if (n) n.outerHTML = nav(); };

function clean() {
  const out = {};
  for (const [a, roles] of Object.entries(S.assign)) for (const [r, ps] of Object.entries(roles)) {
    const keep = ps.map(p => ({ name: (p.name || '').trim(), email: (p.email || '').trim().toLowerCase() })).filter(p => p.name || p.email);
    if (keep.length) (out[a] = out[a] || {})[r] = keep;
  }
  return out;
}
const setWho = () => { S.who = { mode: (S.v.runBy && S.v.runBy.mode) || '', firmID: (S.v.runBy && S.v.runBy.firmID) || '' }; S.whoDirty = false; };
async function saveWho() {
  if (!S.whoDirty) return true;
  if (!S.who.mode || (S.who.mode === 'practitioner' && !S.who.firmID)) { setWho(); return true; } // nothing complete to save: leave the saved choice as it is
  const r = await api('PUT', '/api/run-by', { mode: S.who.mode, ...(S.who.mode === 'practitioner' ? { firmID: S.who.firmID } : {}) });
  if (!r.ok) { toast(r.body.error || 'Not saved.'); return false; }
  S.v = r.body; setWho();
  if (r.body.withdrew) toast('Saved. Your request to start was taken back because who runs it changed; ask again when ready.');
  return true;
}
async function save() {
  if (!(await saveWho())) return false;
  if (!S.dirty) return true;
  const r = await api('PUT', '/api/team', { assign: clean() });
  if (!r.ok) { toast(r.body.error || 'Not saved.'); return false; }
  S.v = r.body; S.assign = structuredClone(r.body.team.assign || {}); S.dirty = false;
  if (r.body.withdrew) toast('Saved. Your request to start was taken back because the team changed; ask again when ready.');
  return true;
}
async function go(i) { if (i < WHO || i > last()) return; if (!(await save())) return; S.step = i; render(); }

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
main.addEventListener('change', ev => {
  const t = ev.target; if (t.name !== 'mode' && t.name !== 'firm') return;
  if (t.name === 'mode') S.who = { mode: t.value, firmID: t.value === 'practitioner' ? S.who.firmID : '' }; else S.who.firmID = t.value;
  S.whoDirty = true; const y = scrollY; render(); scrollTo(0, y);
  const again = main.querySelector(`input[name="${t.name}"][value="${CSS.escape(t.value)}"]`); if (again) again.focus();
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
else { S.v = v.body; S.assign = structuredClone(v.body.team.assign || {}); S.org = (me.ok && me.body.prospect.organisation) || ''; setWho(); S.step = v.body.started || v.body.status === 'approved' || v.body.returned ? last() : v.body.runBy ? 0 : WHO; render(); }
window.TeamApp = { state: () => S };
