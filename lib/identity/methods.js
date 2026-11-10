// Ways to sign up and sign in (development plan task 5.1). Each is its own path under /auth/, covered by its own
// Cloudflare Access application with that one login method and instant authentication, so the button goes straight to
// that provider. Access proves the email whichever way the person signs in; Start then starts the same session
// (lib/identity/session.js handles /auth/email; the other paths are handed to it unchanged apart from the path).
// SIGN_IN_METHODS (a Worker variable, comma-separated) lists the ones set up on a site; ACCESS_AUD holds every one of
// their applications' AUD tags, comma-separated. The order here is the order of the buttons.

export const METHODS = [
  { id: 'google', path: '/auth/google', label: 'Continue with Google' },
  { id: 'microsoft', path: '/auth/microsoft', label: 'Continue with a work account (Microsoft)' },
  { id: 'github', path: '/auth/github', label: 'Continue with GitHub' },
  { id: 'apple', path: '/auth/apple', label: 'Continue with Apple' },
  { id: 'email', path: '/auth/email', label: 'Email me a one-time code' },
];

/** The methods set up on this site, in button order. Email is the default when none are listed. */
export function methodsOn(env) {
  const want = String((env && env.SIGN_IN_METHODS) || 'email').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return METHODS.filter(m => want.includes(m.id));
}

/** For a sign-in path other than /auth/email: the request to hand to session.js, or null (not a method, or not on). */
export function asEmailSignIn(request, env) {
  const url = new URL(request.url);
  const m = METHODS.find(x => x.path === url.pathname && x.id !== 'email');
  if (!m || !methodsOn(env).some(x => x.id === m.id)) return null;
  url.pathname = '/auth/email';
  return new Request(url.toString(), request);
}
