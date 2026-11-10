// Settings for this deployment. None of these are secrets.

// Cloudflare Access (sign-in by email one-time PIN). Found in Cloudflare Zero Trust:
//   teamDomain: Settings → Custom pages → Team domain
//   aud:        Access → Applications → the application that covers start.triodian.com/auth/email → "Application Audience (AUD) Tag"
// The Worker variables ACCESS_TEAM_DOMAIN and ACCESS_AUD override these values; set ACCESS_AUD as a secret for each site.
export const ACCESS = {
  teamDomain: 'damian-hickey-30c.cloudflareaccess.com',
  aud: 'REPLACE-WITH-THE-START-ACCESS-AUD',
};

// Triodian administrators: they see the list of sign-ups and approve provisioning (task 5.6). ADMINS (a Worker
// variable, comma-separated) adds to this list.
export const BOOTSTRAP_ADMINS = ['damian.hickey@triodian.com'];

// The Atlas, which serves the routing table and the solution set (development plan task 5.3). ATLAS_URL overrides it;
// an ATLAS service binding, when set, is used instead of the public address.
export const ATLAS_URL = 'https://obligations-atlas.triodian.com';
