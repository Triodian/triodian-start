# Setting up Triodian Start on Cloudflare

Done once per site, by someone holding the Cloudflare API token (development plan input I.7). Nothing here goes in
the repository except the database ids.

## 1. Databases

```
npx wrangler d1 create triodian-start-db
npx wrangler d1 create triodian-start-test-db
```

Put each `database_id` in `wrangler.jsonc` (the live one at the top, the test one under `env.test`). The tables are
created on first use (`lib/store/d1.js`).

## 2. Sign-up through Cloudflare Access

In Zero Trust → Access → Applications, add a self-hosted application for each site, covering **only the path
`/auth/email`**:

| Site | Application domain | Path |
| --- | --- | --- |
| Live | `start.triodian.com` | `/auth/email` |
| Test | `start-test.triodian.com` | `/auth/email` |

- **Login method:** One-time PIN.
- **Policy:** Allow, Include **Everyone**. This is what makes sign-up open: Access proves the email by a code sent to
  it, and Start adds the prospect.

Copy each application's **Application Audience (AUD) tag** and set it as a secret:

```
npx wrangler secret put ACCESS_AUD               # live
npx wrangler secret put ACCESS_AUD --env test    # test
```

## 3. Try first

Set `DEMO_SESSION_KEY` to the same value the engagement apps hold (docs/demo-sign-in.md in any engagement app):

```
npx wrangler secret put DEMO_SESSION_KEY
npx wrangler secret put DEMO_SESSION_KEY --env test
```

Without it, the *Try the worked example* buttons don't show. A client deployment of Start would set neither this nor
`SUITE_DEMO`.

## 4. Deploy

```
npx wrangler deploy --env test     # start-test.triodian.com, reading obligations-atlas-test.triodian.com
npx wrangler deploy                # start.triodian.com
```

Then sign up on the test site with your email, answer the questions, and check the solution set and the matter brief
link. `ADMINS` (a variable, comma-separated) adds Triodian administrators who can list the sign-ups at
`/api/admin/prospects`.
