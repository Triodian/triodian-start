# Setting up Triodian Start on Cloudflare

Done once, by someone holding the Cloudflare API token (development plan input I.7). The steps run in this order
because each needs the one before: a Worker exists only once it is deployed, and its secrets go on it after. Nothing
here goes in the repository except the database ids.

## 1. Databases

```
npx wrangler d1 create triodian-start-db
npx wrangler d1 create triodian-start-test-db
```

Put each `database_id` in `wrangler.jsonc` (the live one at the top, the test one under `env.test`). The tables are
created on first use (`lib/store/d1.js`).

## 2. Deploy the two Workers

There are two Workers, one per site, and deploying creates each one with its custom domain. Deploy the test site first:

```
npx wrangler deploy --env test     # Worker triodian-start-test, at start-test.triodian.com, reading obligations-atlas-test.triodian.com
```

The landing page works straight away. Signing in answers "Sign-in is not configured" until steps 3 and 4 are done.
Deploy the live site (`npx wrangler deploy`, Worker `triodian-start` at `start.triodian.com`) once the test site works.

To deploy from GitHub instead, as the engagement apps do, connect the repository in Cloudflare (Workers → Create →
Import a repository) once for each Worker: `npx wrangler deploy` for live, `npx wrangler deploy --env test` for test.

## 3. Sign-up through Cloudflare Access

In Zero Trust → Access → Applications, add a self-hosted application for each site, covering **only the path
`/auth/email`**:

| Site | Application domain | Path |
| --- | --- | --- |
| Test | `start-test.triodian.com` | `/auth/email` |
| Live | `start.triodian.com` | `/auth/email` |

- **Login method:** One-time PIN.
- **Policy:** Allow, Include **Everyone**. This is what makes sign-up open: Access proves the email by a code sent to
  it, and Start adds the prospect.

## 4. Secrets on each Worker

Each Access application has its own **Application Audience (AUD) tag**. Copy it and set it on the matching Worker.
`DEMO_SESSION_KEY` is the same value the engagement apps hold (docs/demo-sign-in.md in any engagement app); it turns on
*Try the worked example*.

```
npx wrangler secret put ACCESS_AUD --env test         # the test application's AUD tag
npx wrangler secret put DEMO_SESSION_KEY --env test
npx wrangler secret put ACCESS_AUD                    # the live application's AUD tag
npx wrangler secret put DEMO_SESSION_KEY
```

A secret takes effect at once; no redeploy is needed. A client deployment of Start would set neither
`DEMO_SESSION_KEY` nor `SUITE_DEMO`.

## 5. Check

Sign up on the test site with your email, answer the questions, and check the solution set, the matter brief link and
*Try the worked example*. `ADMINS` (a variable, comma-separated) adds Triodian administrators who can list the
sign-ups at `/api/admin/prospects`.

## 6. More ways to sign in (optional)

The sign-in page shows a button for each way listed in `SIGN_IN_METHODS` (in `wrangler.jsonc`, `email` to start with).
Each way has its own path and its own Access application with just that login method, so its button goes straight to
the provider. Whichever way people sign in, Start learns only their email address.

For each way you add, on each site:

1. **Add the login method** in Zero Trust → Settings → Authentication → Login methods (Cloudflare's guide for each
   provider says what to create on the provider's side).
2. **Add an Access application**, self-hosted, for the site's domain and the path below, with **only that login
   method** ticked, **Instant Auth** on, and a policy of Allow, Include **Everyone**.
3. **Add its AUD tag to `ACCESS_AUD`**, which holds every application's tag for the site, separated by commas:
   `npx wrangler secret put ACCESS_AUD --env test`, then paste `<email tag>,<google tag>,…`.
4. **Add the way to `SIGN_IN_METHODS`** for that site in `wrangler.jsonc`, for example `"google,microsoft,email"`, and
   redeploy.

| Way | Path | Login method in Cloudflare | Notes |
| --- | --- | --- | --- |
| Google | `/auth/google` | Google | Any Google account. Needs an OAuth client in Google Cloud. |
| GitHub | `/auth/github` | GitHub | Needs an OAuth app in GitHub. |
| Work account | `/auth/microsoft` | Microsoft Entra ID | Cloudflare's Entra ID login method is set up for **one directory** (it asks for the Directory (tenant) ID), so it signs in people from that organisation only, such as a client's staff. Signing in "any work account" would need a multi-tenant set-up through Generic OIDC, which is not confirmed to work. Others use the email code. |
| Apple | `/auth/apple` | Generic OIDC | Cloudflare has no Apple login method of its own. Sign in with Apple through Generic OIDC is not confirmed: Apple's client secret is a signed token that expires within six months, and people may share a private relay address instead of their own. Test it on the test site first. |
| Email code | `/auth/email` | One-time PIN | Always available; keep it as the fallback. |

## 7. Marketing email

People choose on `/start/` whether to receive news, guidance and event invitations from Triodian. The box is never
ticked for them, and they can untick it at any time. Start keeps what they agreed to and when.

A Triodian administrator downloads the current list for the mailing tool from
`https://start.triodian.com/api/admin/marketing?format=csv` (signed in). Only people whose latest choice is yes are in
it. Each email sent needs Triodian's name and a working unsubscribe; the mailing tool provides both. Counsel to confirm
the wording in `lib/core/api.js` (`MARKETING`).
