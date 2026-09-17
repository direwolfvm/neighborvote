# Production readiness handoff

NeighborVote is now a community-scoped, trust-based voting application with a polished member journey and Mailgun email. The production release was deployed on September 17, 2026 at https://neighborvote.online. Existing data was preserved through the community migration. No live test email was sent to a member.

## Assessment and changes

| Area | Finding in the prototype | Implemented change |
| --- | --- | --- |
| Community structure | One global roster and election list | Communities, memberships, scoped staff, public community pages, and community-owned elections; existing data is migrated into a default community |
| Eligibility | Verified email plus per-election exclusion only | Configurable postal-code allowlist, email/domain blocklists, required attestations, and optional neighborhood GeoJSON screening; current rules are checked at registration, verification, notification, and voting |
| Trust model | Email verification was implicitly treated as membership verification | Self-reported details and attestations; no manual approval or identity-document workflow; optional geocoding is explicitly described as approximate address screening |
| Account integrity | Public registration could overwrite names and reverify inactive members | Existing names are preserved; inactive accounts and excluded community memberships cannot be reactivated by registration; joining another community requires confirmation through email |
| Staff access | Middleware blocked database-managed managers; global roles had no community boundary | Middleware checks the session; every protected page/action checks current scoped roles; removal revokes existing-session access |
| Voting | Duplicate votes were constrained but errors were swallowed/wrapped incorrectly | Transactional checks, row locks, correct nested PostgreSQL error handling, immutable started ballots, review-before-submit, and database-backed receipt confirmation |
| Email | Plain-text links, no throttle, all-recipient retries | HTML/text templates, expiration/help/fallback links, no tracking, timeouts, hashed shared rate limits, per-recipient delivery ledger, retry/backoff, and explicit handling of uncertain acceptance |
| Scheduling | Scheduled elections did not become voteable automatically | Scheduled elections open at their start time; expired elections cannot notify or accept votes; scheduler claims are safe across overlapping runs |
| Results | Manual totals omitted from exports; spreadsheet formula injection possible | `results.csv` with electronic/manual/combined totals; identifiable `votes.csv`; formula-safe fields and checksummed manifests |
| Operations | Outdated dependencies, broken lint script, non-reproducible image install, migration failure could be ignored | Patched dependencies and overrides, Node-22-generated lockfile with the supported Vite 7 line to avoid cross-platform optional-dependency lock corruption, working lint/type/test/build checks, CI, non-root runtime, environment preflight, health endpoint, locked migrations and a first-upgrade gate |
| Member experience | Technical token input, sparse success/error states, raw vote JSON | Community discovery, understandable membership forms, email confirmation/sign-in, ballot review, clear recovery and empty states, mobile layouts, help/privacy disclosure |

## Verification completed

- 63 unit tests cover templates/escaping, Mailgun request shape/privacy/transport errors, redirects, sessions, ballot validity, eligibility, polygon boundaries/holes, geocoder failures, export safety, and existing helpers.
- 19 real PostgreSQL integration tests cover registration and one-time verification, scoped membership, inactive/excluded members, changing rules, duplicate concurrent voting, throttling, community authorization and staff revocation, scheduled-ballot locking, manual-count validation, and safe notification claims/retries.
- Upgrade fixture: a populated legacy schema refuses the production upgrade without the explicit maintenance flag; the authorized upgrade preserves roster, staff, and recorded votes; rerunning is idempotent.
- The Linux ARM64 container built and ran as UID 1000 using the cached Node 22 slim image (confirmed Debian 12/bookworm). Runtime preflight rejects missing settings, the database health endpoint returns 200, the cron endpoint returns 401 without credentials, and container migration rerun succeeds. The exact AMD64 Dockerfile subsequently built successfully in Cloud Build for the production release.
- Lint, TypeScript, and Next.js production build passed. `npm audit` reports zero known vulnerabilities in the tested dependency graph.
- Browser: community discovery → registration → Mailgun acceptance screen → email confirmation → member portal → ballot request → review → final receipt. Manager login, settings save, and resulting postal-code/attestation form also checked. Desktop/mobile screenshots are under ignored `output/playwright/`.
- Mailgun account API confirmed `neighborvote.online` is active and all three returned sending DNS records are valid. The actual branded email was accepted in provider test mode; this verifies API acceptance, not inbox delivery. Credentials are held in ignored local configuration and application-specific Secret Manager secrets.
- A live Census API check resolved the Census headquarters example address. Boundary behavior, holes, invalid coordinates, ambiguous/unmatched results, and unavailable provider responses are covered by automated tests.

## Production release record — September 17, 2026

- Application commit: `5698a7d` on `main`; GitHub Actions production checks passed, including all 82 tests, upgrade checks, dependency audit, and build.
- Cloud Build: `3290026a-42e5-49ce-8be9-5b47f2ea3e8e` succeeded with the exact Node 22 bookworm Dockerfile on AMD64.
- Image: `us-east4-docker.pkg.dev/permitting-ai-helper/cloud-run-source-deploy/neighborvote@sha256:ad0735424290cf332760ad717f7347976e7ce2e0dac0a56e788aea1b0990e0b3`.
- Cloud Run: `neighborvote`, region `us-east4`, revision `neighborvote-release-5698a7d`, production origin `https://neighborvote.online`. The domain mapping and TLS certificate are healthy.
- Maintenance: automatic deployment and the scheduler were paused, all public traffic was routed to a 503 maintenance revision, and the old revision’s 300-second request timeout was allowed to expire before the final backup and migration. The migration execution `neighborvote-migrate-dr5ck` succeeded. The one-time migration flag was reset to false afterward.
- Preservation: checksums of the existing member, recorded vote, election, and three staff records matched before and after migration. The member has a membership in the default community.
- Recovery: Cloud SQL backup `1789652139890` completed successfully. Daily instance backups are enabled at 07:00 UTC with seven retained backups. An application-only PostgreSQL archive was restored successfully into an isolated local database and upgraded before touching production. The final drained-state archive is stored privately at `gs://permitting-ai-helper-neighborvote-backups/releases/2026-09-17-5698a7d/pre-community-migration.dump`. Restore that application archive for a NeighborVote-only rollback; restoring the entire shared SQL instance would also affect other applications. Do not run the prototype image against the upgraded schema.
- Runtime identity: `neighborvote-runtime@permitting-ai-helper.iam.gserviceaccount.com`, with Cloud SQL Client, access to the eight `NEIGHBORVOTE_` application secrets, bucket-scoped export access, and permission to sign as itself. The existing administrator accounts and session secrets were preserved. Export and backup buckets enforce public access prevention; the runtime has no grant on the backup bucket.
- Mailgun: approved domain and branded sender configured with live sending enabled. The production credential authenticates and sending DNS records are valid. No real inbox-delivery claim is made.
- Live smoke checks: homepage, community pages, registration, login pages, help, database health, cron authentication, and an actual private object write/signed download from the runtime identity passed. The temporary export object was removed. The authenticated notification check sent zero messages.
- Scheduler: `neighborvote-election-open-notify`, every minute, 360-second deadline, authenticated with the existing cron token. Already-notified legacy elections retain their notification history.
- Monitoring: HTTPS health uptime check `neighborvote-production-health-jBE3RG44KXg` and a Cloud Monitoring incident policy. External notification channels are not configured.
- Future pushes: the existing GitHub main trigger uses `cloudbuild.yaml`, the dedicated runtime, production domain, application-specific secrets, and the normal migration gate. The deployment explicitly resets any maintenance command before serving the application.

## Remaining operator setup

1. Rename the default community, set a monitored contact inbox, and select the minimum eligibility rules needed. GIS screening remains off until actual boundaries and known inside/outside addresses are tested.
2. With an authorized test recipient, verify real inbox delivery, email confirmation, voting, and manager access. Provider acceptance and successful application checks do not establish inbox placement.
3. Choose external monitoring notification channels and a recovery-time objective. Daily backups are enabled; PITR remains disabled on the shared SQL instance and requires a separately planned configuration change.

## Operational boundaries

- This application provides trust-based community voting, not identity or residency proof. Postal codes and optional Census geocoding cannot establish who occupies an address.
- Votes are attributable to members in storage/exports. This is disclosed in the public help page; secret-ballot anonymity is not implemented.
- Manual counts are aggregate administrator entries. Community operators must avoid counting the same person electronically and on paper.
- Email ledger `sent` means provider acceptance. Mailgun bounce/delivery webhooks and inbox placement monitoring are not implemented; inspect provider logs for deliverability and uncertain outcomes before retrying.
- Current geocoding supports US addresses and has no service-level guarantee. Errors fail with a recovery message; managers can disable optional screening or correct their boundary.
- The community roster screen shows up to 100 matching members, with search; CSV imports are limited to 2,000 rows / 500 KB. Notification workers process 20 recipients per invocation and five automatic attempts per definitively rejected recipient.
- Production DNS, daily backups, scheduling, and GCS signing were verified during this deployment. Real inbox delivery and external alert delivery remain operator checks.

See [README](../README.md) for setup, configuration, commands, and exact workflow behavior.
