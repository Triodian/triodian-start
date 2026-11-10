(function () {
  var q = new URLSearchParams(location.search);
  var next = q.get('next') || '/start/';
  if (next.charAt(0) !== '/' || next.indexOf('//') === 0) next = '/start/';
  document.getElementById('email-link').href = '/auth/email?next=' + encodeURIComponent(next);
  if (q.get('email') === '0') document.getElementById('m-email').hidden = false;
  if (q.has('out')) document.getElementById('m-out').hidden = false;
  if (/-test\./.test(location.hostname)) document.getElementById('app-name').textContent = 'Triodian Start · test site';
})();
