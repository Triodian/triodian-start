// Triodian Start: the profile questions (development plan task 5.2) and the solution set (task 5.3), with Try first
// (task 5.8). Each answer changes what is shown next. The routing table and the solution set come from the Atlas,
// through this app's own API, so they match the Atlas matter brief.
(function () {
  'use strict';
  var S = { me: null, table: null, a: {}, name: '', org: '', sol: null, err: '', saved: '', seq: 0 };
  var PART = { gc: 'General counsel', advisor: 'Board advisor', chair: 'Chair (with the directors)', board: 'The board, to approve', cro: 'CRO', counsel: 'Counsel (facilitator)', technologyOwner: 'Technology owner: you supply what exists and shape the reporting', risk: 'Risk or AI governance function' };
  var main = document.getElementById('main');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function api(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .catch(function () { return { ok: false, status: 0, body: { error: 'The server could not be reached. Check your connection.' } }; });
  }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.add('hidden'); }, 3500); }
  if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';

  var T = function () { return S.table; };
  var jur = function () { return (T().jurisdictions || []).find(function (j) { return j.code === S.a.jurisdiction; }); };
  var sector = function () { return (T().sectors || []).find(function (d) { return d.regulatedSectorID === S.a.sector; }); };
  var orgChosen = function () { return !!(S.a.sector || S.a.entityType); };
  // The worked example that matches the answers: a superannuation, banking or insurance sector opens that sector's example, and
  // an organisation outside the regulated sectors opens the unregulated one. Other sectors open each app's first example.
  var exampleFor = function () {
    var id = String(S.a.sector || '').toUpperCase();
    var ex = /SUPERANNUATION/.test(id) ? 'superannuation' : /BANKING/.test(id) ? 'banking' : /INSURANCE/.test(id) ? 'insurance' : /-GENERAL$/.test(id) || (!S.a.sector && S.a.entityType) ? 'unregulated' : '';
    return ex ? '&amp;example=' + ex : '';
  };

  function opt(name, value, label, on, note) {
    return '<label class="toggle"><input type="radio" name="' + name + '" value="' + esc(value) + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + (note ? ' <span class="note">' + esc(note) + '</span>' : '') + '</span></label>';
  }
  function q(id, title, why, body) { var m = /^(\d) · (.*)$/.exec(title); return '<section class="q" id="q-' + id + '"><h2>' + (m ? '<span class="stepno">' + m[1] + '</span>' + esc(m[2]) : esc(title)) + '</h2>' + (why ? '<p class="why small soft">' + esc(why) + '</p>' : '') + '<div class="opts">' + body + '</div></section>'; }

  function questions() {
    var t = T(), a = S.a, h = '';
    h += q('role', '1 · Who are you?', 'This sets the part you would usually play in each engagement.', t.roles.map(function (r) { return opt('role', r.id, r.name, a.role === r.id); }).join(''));
    if (!a.role) return h;
    h += q('jurisdiction', '2 · Where is the organisation?', 'The Atlas covers Australia and Singapore in full.', t.jurisdictions.map(function (j) { return opt('jurisdiction', j.code, j.name, a.jurisdiction === j.code, j.covered ? '' : 'not covered yet'); }).join(''));
    if (!a.jurisdiction) return h;
    var secs = (t.sectors || []).filter(function (d) { return d.jurisdiction === a.jurisdiction; });
    var fin = secs.filter(function (d) { return d.financiallyRegulated; }), other = secs.filter(function (d) { return !d.financiallyRegulated; });
    var gen = (t.generalEntityTypes || []).concat([{ id: 'other', name: 'Another kind of organisation' }]);
    var org = '';
    if (fin.length) org += '<div style="width:100%"><div class="grp">Financially regulated</div><div class="opts">' + fin.map(function (d) { return opt('org', 's:' + d.regulatedSectorID, d.name, a.sector === d.regulatedSectorID); }).join('') + '</div></div>';
    if (other.length) org += '<div style="width:100%"><div class="grp">Other sectors</div><div class="opts">' + other.map(function (d) { return opt('org', 's:' + d.regulatedSectorID, d.name, a.sector === d.regulatedSectorID); }).join('') + '</div></div>';
    if (!secs.length) org += '<div style="width:100%"><div class="grp">Financially regulated</div><div class="opts">' + ['bank', 'insurer', 'financialInstitution'].map(function (e) { return opt('org', 'e:' + e, t.entityTypeNames[e] || e, a.entityType === e); }).join('') + '</div></div>';
    org += '<div style="width:100%"><div class="grp">Outside financial regulation</div><div class="opts">' + gen.map(function (e) { return opt('org', 'e:' + e.id, e.name, a.entityType === e.id); }).join('') + '</div></div>';
    h += q('org', '3 · What kind of organisation is it?', 'A financially regulated organisation takes the regulated route: the board directs, then the appetite, then the assessment.', org);
    if (!orgChosen()) return h;
    var regulated = S.sol && S.sol.profile === 'regulated';
    h += q('size', '4 · How large is it?', regulated ? 'For a regulated organisation below 1,000 staff, the use assessment can start in Lite scope.' : 'Size changes little outside financial regulation; it helps Triodian plan the work.', t.sizes.map(function (s) { return opt('size', s.id, s.name, a.size === s.id); }).join(''));
    if (!a.size) return h;
    var prompts = t.prompts.filter(function (p) { return !p.jurisdictions || p.jurisdictions.indexOf(a.jurisdiction) >= 0; });
    h += q('prompt', '5 · What prompted this?', 'This pre-scopes the matter brief and says where to start.', prompts.map(function (p) { return opt('prompt', p.id, p.name, a.prompt === p.id); }).join(''));
    return h;
  }

  function solution() {
    var s = S.sol;
    if (!s) return S.err ? '<p class="err" role="alert">' + esc(S.err) + '</p>' : '';
    var h = '<section class="sol" id="solution" aria-live="polite"><h2 class="sh" style="margin:0">Your solution set' + (s.profileName ? ' · ' + esc(s.profileName) : '') + '</h2>';
    (s.notices || []).forEach(function (n) { h += '<p class="notice">' + esc(n) + '</p>'; });
    s.engagements.forEach(function (e) {
      h += '<article class="eng' + (e.startHere ? ' start' : '') + '" data-eng="' + esc(e.assessmentType) + '"><h3><span class="engno">Step ' + e.step + '</span>' + esc(e.name)
        + (e.mode ? ' <span class="badge b-grey">' + esc(e.mode === 'connected' ? 'Connected mode' : 'Standalone mode') + '</span>' : '')
        + (e.startHere ? ' <span class="badge b-green">Start here</span>' : '') + '</h3>'
        + '<p>' + esc(e.why) + '</p><p class="small soft">' + esc(e.purpose) + '</p>'
        + (e.yourPart !== undefined ? '<p class="small"><strong>Your part:</strong> ' + esc(e.yourPart ? PART[e.yourPart] || e.yourPart : e.yourPartNote) + '</p>' : '')
        + (e.scope ? '<p class="small"><strong>Scope:</strong> ' + (e.scope === 'lite' ? 'Lite: the 10 to 15 arrangements behind critical operations first' : 'Full: every arrangement in the set') + '</p>' : '')
        + '<div class="needs"><div><h4>People</h4><ul>' + e.needs.people.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>'
        + '<div><h4>Documents</h4><ul>' + e.needs.documents.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>'
        + '<div><h4>Sessions</h4><p class="small" style="margin:4px 0 0">' + esc(e.needs.sessions) + '</p></div></div>'
        + '<div class="acts">' + (S.me.tryFirst ? '<a class="btn sm" href="/auth/try?from=start&amp;app=' + encodeURIComponent(e.assessmentType) + exampleFor() + '">Try the worked example</a>' : '') + '</div></article>';
    });
    h += '<p><a class="btn" id="brief" href="' + esc(s.matterBrief.url) + '" target="_blank" rel="noopener">Open the matter brief for this scope</a> <span class="small soft">Opens the AI Obligations Atlas, with your jurisdiction, organisation type and use cases chosen.</span></p>';
    return h + '</section>';
  }

  // Forming the team (task 5.5) is in Admin, linked from the header once the answers are saved. It is kept off this
  // page so that someone looking around sees the engagements and the worked examples without a step in the way.
  function adminLink() {
    var p = S.me.prospect, saved = p.solution && p.solution.engagements && p.solution.engagements.length;
    var a = document.getElementById('team-link');
    if (a) a.classList.toggle('hidden', !saved);
    var q = document.getElementById('requests-link'); // Triodian administrators: the requests to set up (task 5.6)
    if (q) q.classList.toggle('hidden', !S.me.isAdmin);
    if (p.status === 'approved' || p.status === 'provisioned') return '';
    return saved ? ' When you are ready to go ahead, name your team in <a href="/start/team/">Admin</a>.' : '';
  }

  // Where the request to Triodian stands (task 5.6): asked, being set up, or set up with the apps to open.
  function standing() {
    var p = S.me.prospect, apps = (p.provision && p.provision.apps) || [];
    var names = { 'board-direction': 'AI Board Direction', 'risk-appetite': 'AI Risk Appetite', 'use-assessment': 'AI Use Assessment', confidentiality: 'AI Confidentiality Exposure Assessment' };
    if (p.status === 'provisioned') return '<section class="mkt" id="standing"><p style="margin:0 0 6px"><strong>Your engagement is set up.</strong> Sign in to each app with ' + esc(p.email) + '; a one-time code is sent to it.</p><ul class="small" id="myapps" style="margin:0">'
      + apps.map(function (a) { return '<li><a href="' + esc(a.url) + '">' + esc(names[a.id] || a.id) + '</a></li>'; }).join('') + '</ul></section>';
    if (p.status === 'approved') return '<section class="mkt" id="standing"><p style="margin:0"><strong>Triodian is setting up your engagement.</strong> Everyone on your team gets an email with their roles and links once it is ready.</p></section>';
    if (p.status === 'team_ready') return '<section class="mkt" id="standing"><p style="margin:0"><strong>Triodian has your request.</strong> You can still change the team in <a href="/start/team/">Admin</a>; a change takes the request back until you ask again.</p></section>';
    return '';
  }

  // Marketing email from Triodian: opt-in, never ticked for the person; saved as soon as it changes.
  function marketing() {
    var m = S.me.prospect.marketing, on = !!(m && m.consent);
    return '<section class="mkt" id="marketing"><label class="mkt-row"><input type="checkbox" id="mkt"' + (on ? ' checked' : '') + '><span><strong>Keep me informed.</strong> ' + esc(S.me.marketingWording) + '</span></label>'
      + '<p class="small soft" id="mkt-note">' + (m ? (on ? 'You opted in on ' + esc(String(m.at).slice(0, 10)) + '. Untick to stop.' : 'You are not on Triodian’s mailing list.') : 'Optional. Leaving it unticked changes nothing else here.') + '</p></section>';
  }

  // Beside the questions, as the Atlas matter brief shows its scope: the answers so far and Save.
  function aside() {
    var t = T(), a = S.a, nm = function (list, id, key) { var x = (list || []).find(function (i) { return i[key || 'id'] === id; }); return x ? x.name : ''; };
    var org = a.sector ? nm(t.sectors, a.sector, 'regulatedSectorID') : a.entityType ? (t.entityTypeNames[a.entityType] || (a.entityType === 'other' ? 'Another kind of organisation' : a.entityType)) : '';
    var row = function (k, v) { return '<dt>' + esc(k) + '</dt><dd>' + (v ? esc(v) : '<span class="soft">Not yet</span>') + '</dd>'; };
    return '<aside class="facts" aria-label="Your answers"><h2>Your answers</h2><dl class="kv">'
      + row('You', nm(t.roles, a.role)) + row('Where', nm(t.jurisdictions, a.jurisdiction, 'code')) + row('Organisation', org) + row('Size', nm(t.sizes, a.size)) + row('Prompted by', nm(t.prompts, a.prompt))
      + row('Route', S.sol && S.sol.profileName) + '</dl>'
      + '<button class="btn primary" id="save">Save my answers</button><p class="saved" id="saved" style="margin:8px 0 0">' + esc(S.saved) + '</p>'
      + (S.sol ? '<p class="small" style="margin:10px 0 0"><a href="#solution">See the engagements that fit ↓</a></p>' : '') + '</aside>';
  }

  function render() {
    var p = S.me.prospect;
    document.getElementById('who').textContent = p.email;
    var msg = new URLSearchParams(location.search).get('try');
    var keep = window.scrollY;
    main.innerHTML = '<div class="hero" style="margin-bottom:16px"><p class="eyebrow">Signed up as ' + esc(p.email) + '</p><h1>Which engagements fit?</h1>'
      + '<p class="lede">Answer a few questions. Each answer changes what comes next, and the engagements that fit appear below as soon as we know who you are and what kind of organisation it is.</p></div>'
      + (msg === 'off' ? '<p class="notice">Worked examples open from the demo site only.</p>' : '')
      + '<div class="fields"><label>Your name<input id="f-name" value="' + esc(S.name) + '" maxlength="120" autocomplete="name"></label><label>Organisation<input id="f-org" value="' + esc(S.org) + '" maxlength="120" autocomplete="organization"></label></div>'
      + standing() + marketing()
      + '<div class="split"><div class="qs">' + questions() + '</div>' + aside() + '</div>'
      + solution()
      + '<p class="small soft" style="margin-top:22px">Nothing opens in any app until Triodian sets up your engagement with you.' + adminLink() + '</p>';
    window.scrollTo(0, keep);
  }

  function preview() {
    var a = S.a, seq = ++S.seq;
    if (!a.role || !orgChosen()) { S.sol = null; S.err = ''; render(); return; }
    var qs = new URLSearchParams(); Object.keys(a).forEach(function (k) { if (a[k]) qs.set(k, a[k]); });
    api('GET', '/api/solution-set?' + qs.toString()).then(function (r) {
      if (seq !== S.seq) return;
      S.sol = r.ok ? r.body : null; S.err = r.ok ? '' : (r.body.error || 'The solution set could not be shown.');
      render();
    });
  }

  main.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'role' || t.name === 'jurisdiction' || t.name === 'size' || t.name === 'prompt') {
      S.a[t.name] = t.value;
      if (t.name === 'jurisdiction') { delete S.a.sector; delete S.a.entityType; delete S.a.prompt; }
    } else if (t.name === 'org') {
      delete S.a.sector; delete S.a.entityType;
      if (t.value.indexOf('s:') === 0) S.a.sector = t.value.slice(2); else S.a.entityType = t.value.slice(2);
    } else if (t.id === 'f-name') { S.name = t.value; return; }
    else if (t.id === 'f-org') { S.org = t.value; return; }
    else return;
    S.saved = ''; preview();
  });
  main.addEventListener('change', function (ev) {
    if (ev.target.id !== 'mkt') return;
    var want = ev.target.checked;
    api('PUT', '/api/marketing', { consent: want }).then(function (r) {
      if (!r.ok) { toast(r.body.error || 'Not saved.'); ev.target.checked = !want; return; }
      S.me.prospect = r.body.prospect; render(); toast(want ? 'Thank you: you will hear from Triodian.' : 'Done: you are off the mailing list.');
    });
  });
  main.addEventListener('click', function (ev) {
    if (ev.target.id !== 'save') return;
    S.name = (document.getElementById('f-name') || {}).value || S.name; S.org = (document.getElementById('f-org') || {}).value || S.org;
    api('PUT', '/api/profile', { name: S.name, organisation: S.org, answers: S.a }).then(function (r) {
      if (!r.ok) { toast(r.body.error || 'Not saved.'); return; }
      S.me.prospect = r.body.prospect; S.saved = 'Saved.'; render();
    });
  });

  Promise.all([api('GET', '/api/me'), api('GET', '/api/table')]).then(function (rs) {
    if (!rs[0].ok) { main.innerHTML = '<p class="err" role="alert">' + esc(rs[0].body.error || 'Sign in again.') + '</p>'; return; }
    if (!rs[1].ok) { main.innerHTML = '<p class="err" role="alert">' + esc(rs[1].body.error || 'The routing table could not be read.') + '</p>'; return; }
    S.me = rs[0].body; S.table = rs[1].body;
    var p = S.me.prospect; S.a = Object.assign({}, p.answers || {}); S.name = p.name || ''; S.org = p.organisation || '';
    if (p.solution) S.sol = p.solution;
    render(); preview();
  });
  window.StartApp = { state: function () { return S; } };
})();
