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
- SendGrid email delivery

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
- `MAIL_PROVIDER`: currently `sendgrid`
- `MAIL_FROM`: sender email
- `SENDGRID_API_KEY`: SendGrid API key
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

## Cloud Run notes

- Build with `npm run build` and run with `npm run start`.
- Inject secrets via Cloud Run environment variables backed by Secret Manager.
- Use Cloud SQL connector/instance connection as appropriate and set `DATABASE_URL`.
- Set `APP_BASE_URL` to the deployed HTTPS URL so emailed links resolve correctly.

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
