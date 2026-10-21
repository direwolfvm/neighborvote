# NeighborVote

Trust-based voting for neighborhood communities. People self-register, meet their community’s conditions, verify their email, and vote without a manual approval queue.

## What’s included

- Communities with separate rosters, managers, registration rules, and elections.
- Optional allowed postal codes, blocked emails/domains, and required membership attestations.
- Optional GIS screening: upload a WGS84 GeoJSON Polygon/MultiPolygon and check a self-reported US address using Census geocoding. No identity documents or proof-of-residence workflow.
- Branded Mailgun HTML/plain-text email, one-time links, shared database-backed throttling, and retryable per-recipient election notices.
- Draft/scheduled/open/closed elections, ballot review, final submission receipts, database-enforced single voting, election exclusions, manual counts, and audited result exports.
- Scoped staff access, hardened sessions/redirects, health checks, container packaging, and CI.

This is **not a secret-ballot system**: stored votes and staff exports include member identities. Geocoding checks an approximate address location, not that the applicant lives there. The public help page explains both.

## Local development

Requires Node.js 22+ and PostgreSQL 16.

```sh
npm ci
cp .env.example .env.local
# Edit .env.local: database, Mailgun credentials, and random session secrets.
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

The current task’s ignored `.env.local` uses a separate local database on port **5433** and Mailgun **test mode**. `docker compose` defaults to port 5432; adjust the URL if using Compose. Never copy another project’s database connection or session keys into this app.

`db:migrate` reads `.env.local` when DATABASE_URL is not injected; it is transactional and serialized with an advisory lock. `db:seed` is idempotent, local only, and creates an example election.

## Community setup

1. Sign in using an address in `ADMIN_EMAILS` (platform administrators).
2. Create a community, or configure the migrated **NeighborVote Community**.
3. Set its name, description, and a monitored manager contact email.
4. Keep self-registration enabled. Add only the eligibility filters your community needs; leaving filters blank accepts verified emails.
5. Optionally upload a neighborhood boundary. Files may be GeoJSON geometry, Feature, or a single-feature FeatureCollection, with Polygon/MultiPolygon geometry; maximum 500 KB / 5,000 vertices. Coordinates must be WGS84 longitude/latitude.
6. Add community staff. A community administrator may manage staff in that community; a community manager may manage its settings, membership, and elections. Platform administrators can manage all communities.
7. Share `/communities/<slug>`, create a draft election, and publish or schedule it.

Postal codes are matched exactly after removing spaces/hyphens and normalizing case. Blocked domains include subdomains. All required statements must be checked. A boundary adds server-side geocoding; missing, ambiguous, outside, or edge matches fail with a recoverable explanation. Address screening currently supports US addresses only. Optional screening uses the [Census Geocoder API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html); Census describes its coordinates as [interpolated address-range locations](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html).

Conditions are rechecked when email verification is consumed, ballot links are requested, notices are sent, and votes are submitted. Updating an attestation changes its ID and asks existing members to confirm the new statement. Closing registration alone does not revoke existing memberships. Exclusions cannot be bypassed by registering again. Changes do not remove votes already recorded.

## Email

Production identity: `NeighborVote <no-reply@neighborvote.online>`, application origin `https://neighborvote.online`.

Required: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAIL_FROM`; optional `MAIL_REPLY_TO` and `MAILGUN_API_BASE_URL` (`https://api.mailgun.net` or EU counterpart). Use a domain sending key for production. Store secrets in Secret Manager; never commit `.env.local`. Production reads its own key from the `NEIGHBORVOTE_MAILGUN_API_KEY` secret, separate from the shared personal Mailgun key used for local test mode, so it can be scoped to `neighborvote.online` and rotated on its own. Generated Docker env files under `output/` hold live values; keep them ignored and delete them when no longer needed.

```sh
npm run mail:check
```

This always submits in [Mailgun test mode](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/test-mode), never delivers an email, and creates `output/email/verification.html` for preview. Test acceptance is not proof of inbox delivery. Set `MAILGUN_TEST_MODE=false` in production. All private-link emails disable click/open tracking and contain text, HTML, expiry, fallback links, and help.

Email limits are shared across app instances: one request per email per minute, five per hour, and a global cap of 100/minute. Mailgun requests time out after 15 seconds. Explicit failures can be retried; ambiguous transport outcomes become `uncertain` so the system does not automatically duplicate mail.

Configure Cloud Scheduler to `POST /api/jobs/election-open-notifications` every minute with a 360-second attempt deadline, authenticated with an OIDC token from the `neighborvote-scheduler` service account (`--oidc-service-account-email`) and audience `APP_BASE_URL` + the job path. The route accepts that token when its email matches `CRON_INVOKER_EMAIL` (set by `cloudbuild.yaml`). `CRON_JOB_TOKEN` (sent as `x-cron-token`) is only for local runs; production no longer sets it. Each run claims at most 20 recipients, using row locks and unique election/member records. Overlapping runs do not claim the same recipient. The manager screen shows accepted, pending, failed, skipped, or uncertain counts and offers a scoped retry action. Check Mailgun logs before explicitly including uncertain recipients. A “sent” row means accepted by the provider, not confirmed inbox delivery.

## Validation

```sh
npm run lint
npm run typecheck
npm test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/neighborvote_test npm run test:db
npm audit
npm run build
```

The database test command requires a disposable local database named `neighborvote_test`; it refuses other names/remote hosts. It applies migrations and truncates test data. Unit tests do not contact Mailgun or a geocoder. Integration tests use real PostgreSQL and mocked email delivery. CI runs lint, types, unit/integration tests, a production dependency audit, and a build, plus a gitleaks secret scan, dependency review on pull requests, and CodeQL. Actions are pinned to commit SHAs and Dependabot proposes weekly npm, Actions and base-image updates.

## Production release

Read [the production handoff](docs/production-readiness.md) before deployment. The release record is maintained there; application checks do not establish inbox delivery.

`cloudbuild.yaml` builds an image, configures and runs a Cloud Run migration job, then deploys the new service. Configure `_REGION`, `_SERVICE`, `_AR_REPO`, `_CLOUDSQL_INSTANCE`, `_SERVICE_ACCOUNT`, and `_GCS_EXPORT_BUCKET`; `_APP_BASE_URL` defaults to the approved domain. Migration failure stops deployment. The runtime is non-root, uses `npm ci`, validates required production settings, and exposes `/api/health` for startup checks. The migration job bypasses web startup validation and needs only DATABASE_URL.

### How deploys run

`.github/workflows/deploy.yml` deploys every push to `main` (and can be started by hand from Actions → Deploy). It re-runs typecheck and unit tests, authenticates to Google Cloud through Workload Identity Federation as `neighborvote-deployer` (no keys stored in GitHub), submits `cloudbuild.yaml`, and then checks `https://neighborvote.online/api/health`. It runs in the `production` GitHub environment, which only allows `main` and holds the non-secret variables `CLOUDSQL_INSTANCE` and `GCS_EXPORT_BUCKET`.

The Cloud Build GitHub trigger that used to deploy `main` is disabled, not deleted. Keep it disabled while this workflow runs on push, or each merge will deploy twice.

Maintenance releases that need `_ALLOW_COMMUNITY_MIGRATION=true` stay a manual `gcloud builds submit`, as described below.

**The first community migration needs a maintenance release window.** The proof-of-concept revision is not compatible with the new required community columns and staff constraint. The migration refuses a populated production database unless `_ALLOW_COMMUNITY_MIGRATION=true` is explicitly supplied to the build. Stop writes/traffic from the old revision before applying 0008, then route traffic to the new image. Do not roll the old image back onto the migrated schema. Back up the database first and restore the pre-migration backup if that rollback is necessary. Later compatible migrations may use the normal job-before-deploy workflow.

Secret Manager names used by the build have the `NEIGHBORVOTE_` prefix: `NEIGHBORVOTE_DATABASE_URL`, `NEIGHBORVOTE_MAILGUN_API_KEY`, `NEIGHBORVOTE_MAILGUN_DOMAIN`, `NEIGHBORVOTE_MAIL_FROM`, `NEIGHBORVOTE_ADMIN_EMAILS`, `NEIGHBORVOTE_ADMIN_SESSION_SECRET`, and `NEIGHBORVOTE_MEMBER_SESSION_SECRET`. The prefix isolates this application from other services in the project; runtime environment variable names remain unprefixed. Runtime needs Cloud SQL Client, secret access, and bucket-scoped export permissions; signed URLs also require a signing-capable identity. Build identity needs permission to deploy/execute Cloud Run jobs and act as the runtime service account. Configure Cloud SQL backups, HTTPS/domain routing, notification scheduling, and uptime/error monitoring. Plan PITR according to recovery needs and any impact on other databases in a shared instance.

## Data and exports

Migration 0008 places existing elections, members, and staff in the default community. User email remains global, but membership and authority are scoped per community. Imported names never overwrite an existing global account; imported members still need email verification and current community conditions.

Export bundles contain identifiable `votes.csv`, aggregate `results.csv` (electronic + manual totals), and a SHA-256 manifest. Files are private in GCS and downloads use short-lived signed URLs. Spreadsheet formula prefixes are neutralized. Manual counts are administrative totals; operators must prevent paper/electronic double counting. Agree on the association’s retention and correction process before launch.

For an incompatible upgrade, build the release image first. Temporarily disable the Deploy workflow (`gh workflow disable deploy.yml`) and pause the notification scheduler, route all traffic to that image with `node scripts/maintenance.mjs`, wait for requests to the old revision to drain, and take the pre-upgrade backup. Run the migration job with the explicit gate, then deploy the image with its default command. Restore the scheduler and automatic deployment only after health and data-preservation checks pass.
