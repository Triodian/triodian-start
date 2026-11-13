(function () {
  var q = new URLSearchParams(location.search);
  if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';
  // Sign-in on the home page: a button for each way set up on this site (lib/identity/methods.js).
  var next = q.get('next') || '/start/';
  if (next.charAt(0) !== '/' || next.indexOf('//') === 0) next = '/start/';
  var box = document.getElementById('methods');
  var link = function (path) { return path + '?next=' + encodeURIComponent(next); };
  Array.prototype.forEach.call(box.querySelectorAll('a'), function (a) { a.href = link('/auth/' + a.getAttribute('data-method')); });
  fetch('/auth/methods', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.methods || !j.methods.length) return;
    box.innerHTML = '';
    j.methods.forEach(function (m) {
      if (m.id === 'email' && j.methods.length > 1) { var or = document.createElement('div'); or.className = 'or'; or.textContent = 'or'; box.appendChild(or); }
      var a = document.createElement('a');
      a.className = 'btn big ' + (m.id === 'email' ? 'primary' : 'provider');
      a.href = link(m.path); a.textContent = m.label; a.setAttribute('data-method', m.id);
      box.appendChild(a);
    });
  }).catch(function () {});
  if (q.get('email') === '0') document.getElementById('m-email').hidden = false;
  if (q.has('out')) document.getElementById('m-out').hidden = false;
  // Try first needs the demo key on this site; without it, say so instead of offering buttons that can't work.
  var isOff = false, list = document.getElementById('trylist'), sectors = document.getElementById('sectors');
  var off = function () { isOff = true; list.hidden = true; sectors.hidden = true; document.getElementById('tryoff').hidden = false; };
  // The visitor chooses the kind of organisation first. The apps that have a worked example for it are then listed, and
  // each link carries the choice (example=<sector>) so the app opens on that example. Same sector ids in every app.
  sectors.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-sector]'); if (!b || isOff) return;
    var sec = b.getAttribute('data-sector');
    Array.prototype.forEach.call(sectors.querySelectorAll('[data-sector]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    Array.prototype.forEach.call(list.querySelectorAll('a.trybtn'), function (a) {
      a.hidden = a.getAttribute('data-sectors').split(' ').indexOf(sec) < 0;
      a.href = '/auth/try?app=' + encodeURIComponent(a.getAttribute('data-app')) + '&example=' + encodeURIComponent(sec);
    });
    list.hidden = false;
  });
  if (q.get('try') === 'off') off();
  fetch('/auth/try-status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { if (!j.on) off(); }).catch(function () {});
})();
