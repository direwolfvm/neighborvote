# NeighborVote

Open source electronic voting system for a neighborhood citizens association.

This scaffold includes:
- Next.js App Router + TypeScript
- Postgres schema + SQL migrations
- Drizzle ORM type-safe DB access
- Self-registration and email verification flow (`/register`, `/verify`)
- Admin election management and member import flow
- Voting magic-link flow with one-vote DB constraint enforcement

## Tech stack

- Next.js (App Router)
- TypeScript
- Postgres (Cloud SQL compatible)
- Drizzle ORM
- Zod
- Tailwind CSS
- Mailgun email delivery (SendGrid fallback supported)

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start Postgres via Docker Compose:

```bash
docker compose up -d
```

3. Configure environment:

```bash
cp .env.example .env
```

4. Run migrations:

```bash
npm run db:migrate
```

5. Seed sample election:

```bash
npm run db:seed
```

6. Start app:

```bash
npm run dev
```

## Required environment variables

- `DATABASE_URL`: Postgres connection string
- `APP_BASE_URL`: base URL used in email links
- `ADMIN_EMAILS`: comma-separated admin allowlist (case-insensitive)
- `ADMIN_SESSION_SECRET`: at least 32 characters; signs admin session cookies
- `MAIL_PROVIDER`: `mailgun` (or `sendgrid`)
- `MAIL_FROM`: sender email
- `MAILGUN_API_KEY`: Mailgun API key
- `MAILGUN_DOMAIN`: Mailgun domain (for example `mg.example.com`)
- `MAILGUN_API_BASE_URL`: optional; defaults to `https://api.mailgun.net`
- `SENDGRID_API_KEY`: optional, only if `MAIL_PROVIDER=sendgrid`
- `GCS_EXPORT_BUCKET`: Cloud Storage bucket for export bundles (next phase)

## Routes

- `/register` member self-registration
- `/verify` email verification
- `/elections/[id]` voter election page scaffold
- `/admin` election creation + bulk member import
- `/admin/elections/[id]` election settings + eligibility management
- `/admin/login` admin magic-link login

Admin routes now require a cookie session issued via one-time admin magic link and checked by middleware against `ADMIN_EMAILS`.

## Registration + verification flow

1. User submits full name + email at `/register`.
2. Email is normalized to lowercase and upserted in `members`.
3. A one-time verification token is generated, hashed with SHA256, and stored in `member_verification_sessions`.
4. Verification link is emailed.
5. `/verify` validates token hash, expiry, and one-time usage.
6. On success, member status is updated to `verified` and audit event is written.

## Database migrations

- SQL migrations are in `migrations/`.
- Core tables and constraints from the spec are included.
- One additional table `member_verification_sessions` is included for passwordless account verification links.

## Testing

Run unit tests:

```bash
npm test
```

Current tests cover:
- token generation/hash behavior
- import deconfliction by case-insensitive email
- CSV import parsing
- election open-window logic
- export bundle CSV/manifest/hash helpers
- admin session token signing/verification
- GCS path parsing helper
- vote uniqueness constraint error handling helper

## Cloud Run deployment (GitHub push to `main`)

This repo includes:
- `Dockerfile` for Next.js standalone runtime
- `cloudbuild.yaml` for build + deploy
- optional startup migration execution (`RUN_DB_MIGRATIONS`, default `0` in Cloud Build deploy step)

### 1. Required project values

- Project: `permitting-ai-helper`
- Region: `us-east4`
- Cloud SQL instance: `permitting-ai-helper:us-east4:metabase-sql`
- Database name: `neighborvote`
- Cloud Run service: `neighborvote`

### 2. Enable required APIs

```bash
gcloud config set project permitting-ai-helper
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com
```

### 3. Create required secrets

Create or update these Secret Manager secrets:
- `DATABASE_URL`
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAIL_FROM`
- `ADMIN_EMAILS`
- `ADMIN_SESSION_SECRET`

`DATABASE_URL` should use Cloud SQL unix socket format:

```text
postgres://<DB_USER>:<DB_PASSWORD>@/neighborvote?host=/cloudsql/permitting-ai-helper:us-east4:metabase-sql
```

Example secret creation:

```bash
printf '%s' 'postgres://<DB_USER>:<DB_PASSWORD>@/neighborvote?host=/cloudsql/permitting-ai-helper:us-east4:metabase-sql' | gcloud secrets create DATABASE_URL --data-file=- || true
printf '%s' '<mailgun-api-key>' | gcloud secrets create MAILGUN_API_KEY --data-file=- || true
printf '%s' 'mg.example.com' | gcloud secrets create MAILGUN_DOMAIN --data-file=- || true
printf '%s' 'no-reply@your-domain.com' | gcloud secrets create MAIL_FROM --data-file=- || true
printf '%s' 'admin1@example.com,admin2@example.com' | gcloud secrets create ADMIN_EMAILS --data-file=- || true
printf '%s' '<at-least-32-char-random-secret>' | gcloud secrets create ADMIN_SESSION_SECRET --data-file=- || true
```

To rotate/update an existing secret:

```bash
printf '%s' '<new-value>' | gcloud secrets versions add SECRET_NAME --data-file=-
```

### 4. Ensure Cloud Run runtime service account access

Current runtime service account:
- `650621702399-compute@developer.gserviceaccount.com`

Grant at least:
- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor`
- `roles/storage.objectAdmin` (or narrower bucket-scoped write/read for exports)

### 5. Replace trigger to use `cloudbuild.yaml`

Existing trigger (`856a26dd-2781-4174-8ecc-0ce8ef2221e9`) currently uses inline build steps and bypasses `cloudbuild.yaml`.

Delete old trigger:

```bash
gcloud builds triggers delete 856a26dd-2781-4174-8ecc-0ce8ef2221e9 --quiet
```

Create new GitHub trigger (push to `main`) using repo config:

```bash
gcloud builds triggers create github \
  --name=neighborvote-main \
  --repo-owner=direwolfvm \
  --repo-name=neighborvote \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --substitutions=_SERVICE=neighborvote,_REGION=us-east4,_AR_REPO=cloud-run-source-deploy,_CLOUDSQL_INSTANCE=permitting-ai-helper:us-east4:metabase-sql,_SERVICE_ACCOUNT=650621702399-compute@developer.gserviceaccount.com,_APP_BASE_URL=https://neighborvote-wiz2ttea4a-uk.a.run.app,_GCS_EXPORT_BUCKET=<your-export-bucket>
```

### 6. Run a manual build once (for verification)

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_SERVICE=neighborvote,_REGION=us-east4,_AR_REPO=cloud-run-source-deploy,_CLOUDSQL_INSTANCE=permitting-ai-helper:us-east4:metabase-sql,_SERVICE_ACCOUNT=650621702399-compute@developer.gserviceaccount.com,_APP_BASE_URL=https://neighborvote-wiz2ttea4a-uk.a.run.app,_GCS_EXPORT_BUCKET=<your-export-bucket>
```

### 7. Troubleshooting checklist

- If build fails with `Dockerfile: no such file`: trigger is still using old config or commit lacks `Dockerfile`.
- If build fails with `if 'build.service_account' is specified...`: add `options.logging: CLOUD_LOGGING_ONLY` (or a logs bucket/default logs bucket behavior) to `cloudbuild.yaml`.
- If deploy succeeds but app fails startup:
  - check Cloud Run logs:
    `gcloud run services logs read neighborvote --region us-east4 --limit 200`
  - verify `DATABASE_URL` secret format and Cloud SQL instance annotation.
- If DB connection fails:
  - ensure runtime service account has `roles/cloudsql.client`.
- If secret access fails:
  - ensure runtime service account has `roles/secretmanager.secretAccessor`.
- If exports fail:
  - ensure `GCS_EXPORT_BUCKET` exists and runtime service account has storage permissions.

## Bulk import flow

1. Admin uploads CSV (`name,email`) on `/admin`.
2. Emails are normalized and deconflicted case-insensitively.
3. Members are upserted by email and audit events are written.
4. Optionally, imported members are marked eligible for a selected election.

## Voting flow

1. Voter enters email at `/elections/[id]`.
2. If member is verified, eligible, and election is open, a one-time magic link is emailed.
3. Link token is SHA256 hashed in `vote_sessions`.
4. Voter submits a ballot choice from election ballot JSON.
5. Vote is inserted into `votes`; duplicate voting is prevented by `unique(election_id, member_id)`.

## Next implementation phases

- Final hardening for production auth/session model for admin UI

## Result exports

On `/admin/elections/[id]`, admins can trigger export generation:
1. Query votes joined with members for the election.
2. Build `votes.csv`.
3. Build `manifest.json` containing file hashes and metadata.
4. Create a zip bundle with both files.
5. Upload zip to `gs://$GCS_EXPORT_BUCKET/exports/<election-id>/...`.
6. Store bundle path and bundle SHA256 in `exports`.

Cloud Run service account needs write access to the export bucket (for example, `roles/storage.objectAdmin` scoped to that bucket).
Signed download URLs are generated in admin UI for existing exports.
