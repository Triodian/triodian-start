(function () {
  if (/-test\./.test(location.hostname)) document.getElementById('site').textContent = 'Test site';
  // Try first needs the demo key on this site; without it, say so instead of offering buttons that can't work.
  var off = function () { document.getElementById('trylist').hidden = true; document.getElementById('tryoff').hidden = false; };
  if (new URLSearchParams(location.search).get('try') === 'off') off();
  fetch('/auth/try-status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { if (!j.on) off(); }).catch(function () {});
})();
