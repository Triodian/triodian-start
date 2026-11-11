# Triodian Start

The front door to the Triodian AI governance apps (development plan phase 5). A person signs up with their email,
says who they are, what kind of organisation they are in and where, and what prompted them, and sees which
engagements fit, in the order the work is done, what each needs, and a matter brief scoped to them. They can open
each app's worked example before forming a team.

Open source under the Apache License 2.0 (see LICENSE and NOTICE). The Triodian name and logo are trademarks and are
not covered by the licence.

## What it does today

| Task | What is built |
| --- | --- |
| 5.1 Sign-up | Anyone signs up through Cloudflare Access: with an emailed one-time code, or with Google or GitHub where those are set up (`SIGN_IN_METHODS`, docs/setup.md). They choose separately whether to receive marketing email from Triodian (opt-in). The first sign-in adds a *prospect* to this app's own database. Signing up opens nothing in any client's apps: Start is not bound to the suite's identity database, and the journey and engagement routes answer `not_provisioned` until a client is set up. |
| 5.2 Profile questions | Who you are, where, what kind of organisation, how large, what prompted it. Each answer changes what is shown next (the organisation types follow the jurisdiction, the size question explains Lite scope for a regulated organisation, the prompts follow the jurisdiction). |
| 5.3 Solution set | Read from the AI Obligations Atlas (`/api/v1/solution-set` and `/solution-set/table`), which routes the matter brief from the same table, so the two always agree. |
| 5.4 Who runs it | The first step in **Admin** (`/start/team/`): the organisation's own people, a registered practitioner, or Triodian. Practitioners come from the Atlas (`GET /api/v1/firms/directory`): firms approved in the firm registry that asked to be listed, with no person in the list. The choice is kept with the team (`PUT /api/run-by`), the start waits for it, and Triodian makes the introduction when it sets the engagement up (5.6); nothing is sent to the firm before then. |
| 5.5 Team stepper | `/start/team/`, reached from **Admin** in the header once answers are saved (kept off the questions page, so looking around has no step in the way): a step for each engagement in the solution set, with each role explained, then a check of the whole team. The checks (`public/shared/team.js`, shared by the page and the server) stop a start while a needed role is empty or roles conflict, and say why. Starting hands the team to Triodian; invitations are held until Triodian sets the engagement up. |
| 5.8 Try first | On the demo site, *Try the worked example* opens an app signed in as the shared demo account (see `lib/identity/try-first.js`). |

Still to come: who runs it (5.4), provisioning on completion (5.6), the journey view (5.7),
and terms, privacy and pricing (5.9).

## How it fits together

| Part | Where |
| --- | --- |
| Worker entry | `src/worker.js` (Cloudflare wiring only) |
| API, cloud-neutral | `lib/core/api.js` |
| Prospects | `lib/store/d1.js` (Cloudflare D1) |
| Sign-in and sessions | `lib/identity/session.js` and `cloudflare-access.js`, the same files as the engagement apps |
| Pages | `public/index.html` (open: sign-in and Try first), `public/start/` (needs a session); `/login` sends people to the home page |

## Run the tests

```
for f in tests/*.test.mjs; do node "$f"; done          # server rules, against a stand-in Atlas
cd tests/e2e && npm ci && npx playwright test          # the Worker locally (wrangler dev, local D1)
```

The stand-in Atlas (`tests/atlas/stub.mjs`) answers with the Atlas's own routing code, copied by
`node tools/sync-atlas.mjs ../obligations-atlas`. The app itself always asks the Atlas over HTTP.

## Deploy

See [docs/setup.md](docs/setup.md): two D1 databases, an Access application for `/auth/email` open to everyone, the
`ACCESS_AUD` and `DEMO_SESSION_KEY` secrets, and the custom domains `start.triodian.com` and `start-test.triodian.com`.

## Security

See [SECURITY.md](SECURITY.md).
