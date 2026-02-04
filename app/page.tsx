import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-8 text-slate-50 shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm ring-1 ring-white/20">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300/20 text-cyan-100 ring-1 ring-cyan-200/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M3.75 3a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h7.5V3h-7.5ZM12.75 3v6h7.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75h-7.5ZM3 11.25v9a.75.75 0 0 0 .75.75h7.5v-9H3ZM12.75 12v9h7.5a.75.75 0 0 0 .75-.75v-9h-8.25Z" />
              </svg>
            </span>
            <span className="font-medium">NeighborVote</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Trusted electronic voting for neighborhood associations
            </h1>
            <p className="max-w-2xl text-sm text-slate-200 sm:text-base">
              Run elections with secure verification links, simple ballot access,
              and role-based access for members and administrators.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="card space-y-4">
          <h2 className="text-xl font-semibold">Member registration</h2>
          <p className="text-sm text-slate-700">
            New members can register with name and email, then verify via one-time
            email link to access ballots.
          </p>
          <Link href="/register" className="btn w-full justify-center">
            Register as Member
          </Link>
        </article>

        <article className="card space-y-4">
          <h2 className="text-xl font-semibold">Administrator login</h2>
          <p className="text-sm text-slate-700">
            Administrators use allowlisted email login links to manage elections
            and review participation.
          </p>
          <Link href="/admin/login" className="btn-secondary w-full justify-center">
            Log In as Admin
          </Link>
        </article>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">How it works</h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <p>1. Register members with verified email links.</p>
          <p>2. Publish elections and distribute secure vote URLs.</p>
          <p>3. Track turnout and export finalized results.</p>
        </div>
      </div>
    </section>
  );
}
