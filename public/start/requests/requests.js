// Triodian's side of provisioning (development plan task 5.6): the requests to set an engagement up. A Triodian
// administrator approves a request (the client's code, its first administrator, the delivery side's people), takes the
// job file to the provisioning script on their own computer, brings the result back, and sends the invitations.
// The checks come from /shared/team.js, the same file the server uses.
import { checkTeam } from '/shared/team.js';

const main = document.getElementById('main');
const S = { list: [], sending: false, open: null, form: {} };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (method, path, body) => fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  .then(r => r.json().catch(() => ({})).then(j => ({ ok: r.ok, status: r.status, body: j })))
  .catch(() => ({ ok: false, status: 0, body: { error: 'The server could not be reached. Check your connection.' } }));
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 5000); }
if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';

const STATUS = { team_ready: ['Waiting for approval', 'b-aub'], approved: ['Approved: run the job', 'b-grey'], provisioned: ['Set up', 'b-green'] };
const RUN = { self: 'The client’s own people', practitioner: 'A registered practitioner', triodian: 'Triodian' };
const day = iso => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const cur = () => S.list.find(r => r.id === S.open) || null;
const runBy = r => r.runBy ? (r.runBy.mode === 'practitioner' ? 'With ' + (r.runBy.firm || 'a registered practitioner') : RUN[r.runBy.mode]) : 'Not chosen';

// The approval form for one request, kept while the administrator types.
function formFor(r) {
  if (S.form.id === r.id) return S.form;
  const pv = r.provision || {};
  return (S.form = { id: r.id, code: pv.code || '', admin: pv.admin || (r.runBy && r.runBy.mode === 'self' ? r.contact.email : ''),
    org: pv.deliveryOrganisation || (r.runBy && r.runBy.mode === 'practitioner' ? r.runBy.firm || '' : 'Triodian'), assign: structuredClone((pv.delivery && pv.delivery.assign) || {}), note: '' });
}
const slot = (f, a, rid) => ((f.assign[a] = f.assign[a] || {})[rid] = f.assign[a][rid] || [{ name: '', email: '' }]);
const cleanAssign = f => { const out = {}; for (const [a, roles] of Object.entries(f.assign)) for (const [rid, ps] of Object.entries(roles)) { const keep = ps.map(p => ({ name: (p.name || '').trim(), email: (p.email || '').trim().toLowerCase() })).filter(p => p.name || p.email); if (keep.length) (out[a] = out[a] || {})[rid] = keep; } return out; };
function problems(r, f) {
  const assign = {}; for (const src of [r.team.assign, cleanAssign(f)]) for (const [a, roles] of Object.entries(src)) assign[a] = { ...(assign[a] || {}), ...roles };
  const out = checkTeam(r.engagements.map(e => ({ assessmentType: e.assessmentType, mode: e.mode || undefined })), { assign }, { triodian: true }).map(p => p.reason);
  if (!/^[a-z](?:[a-z0-9]|-(?!-)){0,18}[a-z0-9]$/.test(f.code.trim())) out.unshift('Give the client a code: 2 to 20 lowercase letters, digits and hyphens, starting with a letter.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.admin.trim())) out.unshift('Name the client’s first administrator by email.');
  return out;
}

function listView() {
  if (!S.list.length) return '<p class="saved">No requests are waiting. A request appears here when an organisation has formed its team and asked Triodian to set the engagement up.</p>';
  return `<div class="tw"><table class="ptable" id="queue"><thead><tr><th>Organisation</th><th>Asked by</th><th>Engagements</th><th>Who runs it</th><th>Status</th><th></th></tr></thead><tbody>${S.list.map(r => `<tr data-id="${esc(r.id)}">
    <td><strong>${esc(r.organisation || '(no name given)')}</strong>${r.provision ? `<br><span class="small soft">${esc(r.provision.code)}</span>` : ''}</td><td>${esc(r.contact.name || '')}<br><span class="small soft">${esc(r.contact.email)}</span>${r.askedAt ? `<br><span class="small soft">${day(r.askedAt)}</span>` : ''}</td>
    <td>${r.engagements.map(e => esc(e.name)).join('<br>')}</td><td>${esc(runBy(r))}</td><td><span class="badge ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td>
    <td><button class="btn sm" data-open="${esc(r.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`;
}

function clientTeam(r) {
  const rows = r.engagements.flatMap(e => e.roles.filter(x => x.side === 'client').flatMap(role => ((r.team.assign[e.assessmentType] || {})[role.id] || []).map(p => `<tr><td>${esc(e.name)}</td><td>${esc(role.one || role.name)}</td><td>${esc(p.name || '—')}</td><td>${esc(p.email)}</td></tr>`)));
  return `<details class="role"><summary><strong>The client’s team</strong> <span class="small soft">${rows.length} role${rows.length === 1 ? '' : 's'} filled; it passed the checks when the client asked</span></summary>
    <div class="tw"><table class="ptable"><thead><tr><th>Engagement</th><th>Role</th><th>Name</th><th>Email</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

function approveView(r) {
  const f = formFor(r), ps = problems(r, f), locked = r.status === 'provisioned';
  const role = (e, x) => { const p = slot(f, e.assessmentType, x.id)[0]; const id = `d-${e.assessmentType}-${x.id}`; return `<div class="arow"><span class="small"><strong>${esc(x.name)}</strong></span>
      <label class="vh" for="${id}-n">${esc(x.name)} name</label><input id="${id}-n" class="in" placeholder="Name" value="${esc(p.name)}" data-a="${e.assessmentType}" data-r="${x.id}" data-k="name" maxlength="120" ${locked ? 'disabled' : ''}>
      <label class="vh" for="${id}-e">${esc(x.name)} email</label><input id="${id}-e" class="in" type="email" placeholder="Email" value="${esc(p.email)}" list="known" data-a="${e.assessmentType}" data-r="${x.id}" data-k="email" maxlength="200" ${locked ? 'disabled' : ''}></div>`; };
  return `<section class="role" id="approve"><div class="role-h"><h3>1. Approve</h3>${r.provision ? `<span class="badge b-green">Approved ${day(r.provision.approvedAt)} by ${esc(r.provision.approvedBy)}</span>` : '<span class="badge b-aub">To do</span>'}</div>
    <p class="small soft">${r.runBy && r.runBy.mode === 'practitioner' ? `The client chose ${esc(r.runBy.firm || 'a registered practitioner')}. Make the introduction first; the firm’s people then fill the delivery roles below, and the job file can go to the firm to run in its own account.` : 'Give the client a code, name its first administrator, and name the people on the delivery side.'}</p>
    <div class="arow"><label class="small" for="f-code"><strong>Client code</strong></label><input id="f-code" class="in" value="${esc(f.code)}" data-f="code" maxlength="20" placeholder="e.g. coastline" autocapitalize="off" spellcheck="false" ${r.provision && r.status !== 'team_ready' ? 'disabled' : ''}>
      <span class="small soft">Part of the apps’ addresses and names. It cannot change once approved.</span></div>
    <div class="arow"><label class="small" for="f-admin"><strong>First administrator</strong></label><input id="f-admin" class="in" type="email" value="${esc(f.admin)}" data-f="admin" maxlength="200" placeholder="Email" ${locked ? 'disabled' : ''}>
      <span class="small soft">Can add people and change roles in each app.</span></div>
    <div class="arow"><label class="small" for="f-org"><strong>Delivery organisation</strong></label><input id="f-org" class="in" value="${esc(f.org)}" data-f="org" maxlength="120" ${locked ? 'disabled' : ''}>
      <span class="small soft">Shown beside the delivery side’s people in the apps.</span></div>
    ${r.engagements.map(e => `<h4 class="small" style="margin:14px 0 4px">${esc(e.name)}${e.mode ? ` · ${e.mode === 'connected' ? 'connected' : 'standalone'} mode` : ''}</h4>${e.roles.filter(x => x.side === 'triodian').map(x => role(e, x)).join('')}`).join('')}
    <div id="problems">${problemList(ps)}</div>
    ${locked ? '' : `<p class="acts"><button class="btn primary" id="do-approve" ${ps.length ? 'disabled' : ''}>${r.provision ? 'Save the approval again' : 'Approve'}</button></p>
    <details class="small" style="margin-top:10px"><summary>Send it back to the client instead</summary><div class="prow" style="margin-top:8px"><label class="vh" for="f-note">Why</label><input id="f-note" class="in" data-f="note" maxlength="500" placeholder="Why, in a sentence. The client sees this." value="${esc(f.note)}" style="flex:1"><button class="btn sm" id="do-return">Send back</button></div></details>`}</section>`;
}
const problemList = ps => ps.length ? `<ul class="problems" style="margin-top:12px">${ps.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="saved" style="margin:12px 0 0">Every role is filled and every check passes.</p>';

function jobView(r) {
  if (!r.provision) return '<section class="role tri"><div class="role-h"><h3>2. Set the apps up</h3><span class="badge b-grey">After approval</span></div><p class="small soft">Approval makes the job file for the provisioning script.</p></section>';
  const file = `triodian-job-${r.provision.code}.json`, done = r.status === 'provisioned';
  return `<section class="role" id="job"><div class="role-h"><h3>2. Set the apps up</h3>${done ? `<span class="badge b-green">Set up ${day(r.provision.provisionedAt)}</span>` : '<span class="badge b-aub">To do</span>'}</div>
    ${done ? `<ul class="small" id="apps">${r.provision.appUrls.map(a => `<li><a href="${esc(a.url)}" rel="noopener">${esc(a.url.replace('https://', ''))}</a></li>`).join('')}</ul>` : `<ol class="small">
      <li><a class="btn sm" id="get-job" href="/api/admin/requests/${esc(r.id)}/job" download="${esc(file)}">Download the job file</a> It names the client, the apps and the people with their roles. It holds no password or token.</li>
      <li>On the computer that has the practice hub and the Cloudflare token, run:<pre class="invite">node tools/provision-client.mjs --job ${esc(file)}</pre>Add <code>--dry-run</code> first to see every step. A second run changes nothing.</li>
      <li>The script writes <code>${esc(file.replace('.json', '.result.json'))}</code> beside the job file. Bring it back here:
        <p style="margin:8px 0 0"><label class="vh" for="result">The result file</label><input type="file" id="result" accept="application/json,.json"></p></li></ol>`}</section>`;
}

function inviteView(r) {
  if (r.status !== 'provisioned') return '<section class="role tri"><div class="role-h"><h3>3. Send the invitations</h3><span class="badge b-grey">After the apps are set up</span></div><p class="small soft">Each person gets one email listing their roles and the address of each app.</p></section>';
  const inv = r.invitations, left = inv.filter(i => i.status !== 'sent').length;
  const st = i => i.status === 'sent' ? `<span class="badge b-green">Sent ${day(i.at)}</span>` : i.status === 'failed' ? `<span class="badge b-red">Not sent</span><br><span class="small soft">${esc(i.error || '')}</span>` : '<span class="badge b-grey">Held</span>';
  return `<section class="role" id="invites"><div class="role-h"><h3>3. Send the invitations</h3><span class="badge ${left ? 'b-aub' : 'b-green'}">${left ? left + ' to send' : 'All sent'}</span></div>
    ${S.sending ? '' : '<p class="notice" id="sending-off">Email sending is not switched on for this site, so invitations cannot be sent from here yet (docs/setup.md, “Invitations”).</p>'}
    <div class="tw"><table class="ptable" id="invtable"><thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Invitation</th><th></th></tr></thead><tbody>${inv.map(i => `<tr><td>${esc(i.name || '—')}</td><td>${esc(i.email)}</td>
      <td>${i.roles.map(x => esc(x.appName + ': ' + x.roleName)).join('<br>') || (i.admin ? 'Administrator' : '')}${i.admin && i.roles.length ? '<br><span class="small soft">Administrator</span>' : ''}</td><td>${st(i)}</td>
      <td>${i.status === 'sent' ? `<button class="btn sm ghost" data-again="${esc(i.email)}" ${S.sending ? '' : 'disabled'}>Send again</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${inv.length ? `<details class="small"><summary>See the invitation ${esc(inv[0].name || inv[0].email)} gets</summary><pre class="invite">${esc('Subject: ' + inv[0].subject + '\n\n' + inv[0].text)}</pre></details>` : ''}
    <p class="acts"><button class="btn primary" id="do-send" ${left && S.sending ? '' : 'disabled'}>Send ${left || ''} invitation${left === 1 ? '' : 's'}</button></p></section>`;
}

function detail(r) {
  const known = new Map(); for (const roles of Object.values(formFor(r).assign)) for (const ps of Object.values(roles)) for (const p of ps) if (p.email) known.set(p.email.toLowerCase(), p.name || '');
  document.getElementById('known').innerHTML = [...known].map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('');
  return `<p><button class="btn sm" data-open="">All requests</button></p>
    <h2 class="team-h">${esc(r.organisation || '(no name given)')} <span class="badge ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></h2>
    <p class="small soft">Asked by ${esc(r.contact.name || r.contact.email)} (${esc(r.contact.email)})${r.askedAt ? ' on ' + day(r.askedAt) : ''}. Run by: ${esc(runBy(r))}. Engagements: ${r.engagements.map(e => esc(e.name)).join(', ')}.</p>
    ${clientTeam(r)}${approveView(r)}${jobView(r)}${inviteView(r)}`;
}

function render() {
  const r = cur();
  main.innerHTML = `<div class="hero" style="margin-bottom:14px"><p class="eyebrow">Triodian administrators</p><h1>Requests to set up</h1>
    <p class="lede">An organisation that has formed its team asks Triodian to set its engagement up. Approve it, set the apps up, then send the invitations.</p></div>${r ? detail(r) : listView()}`;
}
async function load() {
  const r = await api('GET', '/api/admin/requests');
  if (!r.ok) { main.innerHTML = `<p class="notice" role="alert">${esc(r.body.error || 'The requests could not be read.')}</p><p><a class="btn" href="/start/">Back</a></p>`; return false; }
  S.list = r.body.requests; S.sending = r.body.sending; if (S.open && !cur()) S.open = null; render(); return true;
}
const put = req => { S.list = S.list.map(x => x.id === req.id ? req : x); if (S.form.id === req.id) S.form = {}; render(); };

main.addEventListener('input', ev => {
  const t = ev.target, r = cur(); if (!r || !t.dataset) return; const f = formFor(r);
  if (t.dataset.f) f[t.dataset.f] = t.value;
  else if (t.dataset.k) {
    const p = slot(f, t.dataset.a, t.dataset.r)[0]; p[t.dataset.k] = t.value;
    if (t.dataset.k === 'email') { const opt = [...document.getElementById('known').options].find(o => o.value === t.value.trim().toLowerCase()), box = document.getElementById(t.id.replace(/-e$/, '-n')); if (opt && opt.textContent && box && !box.value) { box.value = opt.textContent; p.name = opt.textContent; } }
  } else return;
  if (t.dataset.f === 'note') return;
  const ps = problems(r, f); document.getElementById('problems').innerHTML = problemList(ps); const b = document.getElementById('do-approve'); if (b) b.disabled = ps.length > 0;
});
main.addEventListener('change', async ev => {
  const t = ev.target, r = cur(); if (t.id !== 'result' || !r || !t.files[0]) return;
  let body; try { body = JSON.parse(await t.files[0].text()); } catch (e) { toast('That file is not a provisioning result (it is not JSON).'); t.value = ''; return; }
  const x = await api('POST', `/api/admin/requests/${r.id}/provisioned`, body);
  if (!x.ok) { toast(x.body.error || 'The result was not accepted.'); t.value = ''; return; }
  put(x.body.request); toast('The client is set up. The invitations are ready to send.');
});
main.addEventListener('click', async ev => {
  const t = ev.target.closest('button'); if (!t) return; const r = cur();
  if (t.dataset.open != null) { S.open = t.dataset.open || null; S.form = {}; render(); window.scrollTo(0, 0); return; }
  if (!r) return;
  if (t.id === 'do-approve') {
    const f = formFor(r);
    const x = await api('PUT', `/api/admin/requests/${r.id}/approve`, { code: f.code.trim(), admin: f.admin.trim(), deliveryOrganisation: f.org.trim(), delivery: { assign: cleanAssign(f) } });
    if (!x.ok) { toast(x.body.error || 'Not approved.'); return; }
    put(x.body.request); toast('Approved. Download the job file and run the provisioning script.');
  }
  if (t.id === 'do-return') {
    const x = await api('POST', `/api/admin/requests/${r.id}/return`, { note: formFor(r).note });
    if (!x.ok) { toast(x.body.error || 'Not sent back.'); return; }
    S.open = null; S.form = {}; await load(); toast('Sent back to the client with your note.');
  }
  if (t.id === 'do-send' || t.dataset.again) {
    t.disabled = true;
    const x = await api('POST', `/api/admin/requests/${r.id}/invitations`, t.dataset.again ? { again: [t.dataset.again] } : {});
    if (!x.ok) { toast(x.body.error || 'Nothing was sent.'); t.disabled = false; return; }
    put(x.body.request); toast(x.body.failed ? `${x.body.sent} sent; ${x.body.failed} could not be sent. The table says why.` : `${x.body.sent} invitation${x.body.sent === 1 ? '' : 's'} sent.`);
  }
});

await load();
window.RequestsApp = { state: () => S };
