(function () {
  var q = new URLSearchParams(location.search);
  var next = q.get('next') || '/start/';
  if (next.charAt(0) !== '/' || next.indexOf('//') === 0) next = '/start/';
  var box = document.getElementById('methods');
  var link = function (path) { return path + '?next=' + encodeURIComponent(next); };
  var draw = function (methods) {
    box.innerHTML = '';
    methods.forEach(function (m, i) {
      var a = document.createElement('a');
      a.className = 'btn' + (m.id === 'email' ? ' ghost-email' : '');
      a.href = link(m.path); a.textContent = m.label; a.setAttribute('data-method', m.id);
      if (m.id === 'email' && methods.length > 1) { var or = document.createElement('div'); or.className = 'or'; or.textContent = 'or'; box.appendChild(or); }
      box.appendChild(a);
    });
  };
  Array.prototype.forEach.call(box.querySelectorAll('a'), function (a) { a.href = link(a.getAttribute('data-path')); });
  fetch('/auth/methods', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { if (j.methods && j.methods.length) draw(j.methods); }).catch(function () {});
  if (q.get('email') === '0') document.getElementById('m-email').hidden = false;
  if (q.has('out')) document.getElementById('m-out').hidden = false;
  if (/-test\./.test(location.hostname)) document.getElementById('app-name').textContent = 'Triodian Start · test site';
})();
