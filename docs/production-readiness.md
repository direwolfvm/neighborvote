# Production readiness handoff

NeighborVote is now a community-scoped, trust-based voting application with a polished member journey and Mailgun email. This handoff distinguishes completed application work from the remaining live release checks. No production data was migrated, no production service was deployed, and no email was delivered to a member during this work.

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
- The Linux ARM64 container built and ran as UID 1000 using the cached Node 22 slim image (confirmed Debian 12/bookworm). Runtime preflight rejects missing settings, the database health endpoint returns 200, the cron endpoint returns 401 without credentials, and container migration rerun succeeds. The exact default AMD64 base-image fetch stalled in local Docker; validate that target in Cloud Build.
- Lint, TypeScript, and Next.js production build passed. `npm audit` reports zero known vulnerabilities in the tested dependency graph.
- Browser: community discovery → registration → Mailgun acceptance screen → email confirmation → member portal → ballot request → review → final receipt. Manager login, settings save, and resulting postal-code/attestation form also checked. Desktop/mobile screenshots are under ignored `output/playwright/`.
- Mailgun account API confirmed `neighborvote.online` is active and all three returned sending DNS records are valid. The actual branded email was accepted in provider test mode; this verifies API acceptance, not inbox delivery. Credentials remain only in ignored local configuration.
- A live Census API check resolved the Census headquarters example address. Boundary behavior, holes, invalid coordinates, ambiguous/unmatched results, and unavailable provider responses are covered by automated tests.

## Live release steps

1. **Prepare the environment.** Configure the approved HTTPS origin, actual platform administrator email(s), unique random session/cron secrets, Mailgun sender/domain/key, Cloud SQL connection, and private GCS export bucket. Prefer a domain-scoped sending key over the locally supplied account key. Set `MAILGUN_TEST_MODE=false`; optional Reply-To must be a monitored inbox. The runtime preflight rejects missing/placeholder configuration and test-mode mail.
2. **Plan the first maintenance release.** Back up production and verify restore access. Stop traffic/writes to the proof-of-concept revision. The first community migration is not compatible with writes from that old revision. Explicitly set `_ALLOW_COMMUNITY_MIGRATION=true` for the migration build only after that maintenance condition is met. The migration job runs before deployment and failure stops release. Do not roll the old image back onto the new schema; restore the backup if that rollback is required.
3. **Configure community details.** Rename the default community, set a real contact inbox, add scoped staff, and choose the minimum trust-based rules needed. GIS screening is off by default. If used, test known inside/outside addresses against the actual GIS export before enabling it for residents.
4. **Connect operations.** Point HTTPS traffic at the new revision. Schedule the authenticated notification endpoint every minute with an adequate timeout. Set uptime/error monitoring and database backups/PITR. Scope Cloud SQL, Secret Manager, and export/signing permissions to the runtime service account.
5. **Run the live smoke check.** Use a designated test member and a test election to confirm real inbox delivery, email verification, ballot request, review/submission, duplicate prevention, manager access, notification status, and a private signed export download. This requires an authorized real test recipient; no unsolicited mail was sent as part of this task.

## Operational boundaries

- This application provides trust-based community voting, not identity or residency proof. Postal codes and optional Census geocoding cannot establish who occupies an address.
- Votes are attributable to members in storage/exports. This is disclosed in the public help page; secret-ballot anonymity is not implemented.
- Manual counts are aggregate administrator entries. Community operators must avoid counting the same person electronically and on paper.
- Email ledger `sent` means provider acceptance. Mailgun bounce/delivery webhooks and inbox placement monitoring are not implemented; inspect provider logs for deliverability and uncertain outcomes before retrying.
- Current geocoding supports US addresses and has no service-level guarantee. Errors fail with a recovery message; managers can disable optional screening or correct their boundary.
- The community roster screen shows up to 100 matching members, with search; CSV imports are limited to 2,000 rows / 500 KB. Notification workers process 20 recipients per invocation and five automatic attempts per definitively rejected recipient.
- Production DNS, Cloud SQL backups, Cloud Scheduler, GCS signing permissions, and real inbox delivery must be verified in the actual deployment environment. Local checks do not establish their live state.

See [README](../README.md) for setup, configuration, commands, and exact workflow behavior.
