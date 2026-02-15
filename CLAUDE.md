# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this project?

NeighborVote is an open-source electronic voting system for a neighborhood citizens association. It handles member registration, admin-managed elections, magic-link authentication, ballot voting with one-vote enforcement, and result exports.

## Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript checking (tsc --noEmit)
npm test                 # Run all tests (vitest run)
npm run test:watch       # Run tests in watch mode
npx vitest run tests/token.test.ts  # Run a single test file

# Database
docker compose up -d     # Start local Postgres
npm run db:migrate       # Run SQL migrations
npm run db:seed          # Seed sample election
npm run db:generate      # Generate Drizzle migration artifacts
npm run db:push          # Push schema directly (dev only)
```

## Architecture

**Next.js App Router** with server actions (no separate API layer for most operations). All route handlers and server actions are in `app/`.

### Key directories

- `app/` — Pages and server actions organized by route (`admin/`, `member/`, `elections/[id]/`, `register/`, `verify/`)
- `lib/` — Shared business logic (auth, crypto, email, CSV parsing, election rules, export helpers)
- `db/schema.ts` — Drizzle ORM schema (single file, all tables)
- `db/client.ts` — Singleton Postgres pool with Drizzle instance (hot-reload safe)
- `migrations/` — Sequential SQL migration files (`0001_init.sql`, etc.)
- `tests/` — Vitest unit tests (pure logic tests, no DB or network)
- `components/` — Shared React components
- `scripts/` — DB migration runner and seed script

### Authentication model

Two separate cookie-based session systems, both using HMAC-SHA256 signed tokens:
- **Admin**: `nv_admin_session` cookie, gated by `ADMIN_EMAILS` allowlist. Middleware in `middleware.ts` protects all `/admin/*` routes (except `/admin/login`).
- **Member**: `nv_member_session` cookie with `memberId` + `email` payload. Verified in server actions, not middleware.

Both use magic-link login flows — tokens are SHA256-hashed before DB storage, verified on click.

### Database

Postgres with Drizzle ORM. Schema in `db/schema.ts` defines: `members`, `elections`, `election_eligibility`, `vote_sessions`, `votes`, `manual_vote_counts`, `audit_events`, `exports`, `member_verification_sessions`, `admin_login_tokens`, `member_login_tokens`.

Emails are always stored lowercase with a DB-level check constraint. Vote uniqueness is enforced by `unique(election_id, member_id)` on the `votes` table.

### Email

`lib/mailer.ts` supports Mailgun (default) and SendGrid via `MAIL_PROVIDER` env var. Used for verification emails, magic-link logins, and election-open notifications.

### Path alias

`@/*` maps to project root (configured in `tsconfig.json` and `vitest.config.ts`).

## Environment

Requires `DATABASE_URL` for Postgres. Local default: `postgres://postgres:postgres@localhost:5432/neighborvote`. See `.env.example` for all required variables.

## Deployment

Cloud Run via `cloudbuild.yaml`. Next.js standalone output mode. Cloud SQL via unix socket. Secrets in Google Secret Manager.
