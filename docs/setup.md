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
