// Settings for this deployment. None of these are secrets.

// Cloudflare Access (sign-in by email one-time PIN). Found in Cloudflare Zero Trust:
//   teamDomain: Settings → Custom pages → Team domain
//   aud:        Access → Applications → the application that covers start.triodian.com/auth/email → "Application Audience (AUD) Tag"
// The Worker variables ACCESS_TEAM_DOMAIN and ACCESS_AUD override these values; set ACCESS_AUD as a secret for each site.
export const ACCESS = {
  teamDomain: 'damian-hickey-30c.cloudflareaccess.com',
  aud: 'REPLACE-WITH-THE-START-ACCESS-AUD',
};

// Triodian administrators (they see the sign-ups and approve provisioning, task 5.6) are not in the source. They come
// only from the ADMINS variable of the deployment (wrangler.jsonc vars, or the Cloudflare dashboard), comma-separated,
// so a deployment can change or revoke them without a code change, and a site with none set has no administrator
// (penetration test 16 Nov 2026, PT-01: the compiled list was added to ADMINS on every request and could not be removed).

// The Atlas, which serves the routing table and the solution set (development plan task 5.3). ATLAS_URL overrides it;
// an ATLAS service binding, when set, is used instead of the public address.
export const ATLAS_URL = 'https://obligations-atlas.triodian.com';
