import Link from "next/link";
export default function HomePage() {
  return (
    <section className="space-y-14 py-5 sm:py-10">
      <div className="grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <p className="eyebrow">Small communities. Meaningful decisions.</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            A stronger neighborhood
            <br />
            <span className="text-emerald-800">starts with you.</span>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-slate-600">
            A simple way to have a say in the place you call home. Join your community, see what’s
            on the ballot, and make your voice count.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn" href="/communities">
              Find your community <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn-secondary" href="/member/login">
              Sign in
            </Link>
          </div>
          <p className="text-sm text-slate-500">
            No passwords. No paperwork. Just neighbors making decisions.
          </p>
        </div>
        <div className="relative rounded-3xl bg-[#e2ece3] px-7 py-10 sm:px-10">
          <svg viewBox="0 0 320 200" className="mx-auto mb-8 w-full max-w-sm" aria-hidden="true">
            <path d="M25 180h270" stroke="#708b74" strokeWidth="2" />
            <path d="M44 100l60-55 60 55v80H44z" fill="#f8faf5" stroke="#285a43" strokeWidth="3" />
            <path
              d="M172 111l46-45 46 45v69h-92z"
              fill="#b4cbb7"
              stroke="#285a43"
              strokeWidth="3"
            />
            <path d="M91 137h27v43H91zM207 138h23v42h-23z" fill="#285a43" />
            <path d="M69 109h22v22H69zM119 109h22v22h-22zM199 110h36" fill="#d2ad62" />
            <circle cx="269" cy="49" r="22" fill="#d2ad62" />
            <path d="M18 147v33M294 140v40" stroke="#285a43" strokeWidth="3" />
            <circle cx="18" cy="139" r="16" fill="#87a78b" />
            <circle cx="294" cy="131" r="20" fill="#87a78b" />
          </svg>
          <p className="eyebrow">Built around belonging</p>
          <p className="mt-3 text-2xl font-medium leading-snug">
            Your street. Your shared spaces.
            <br />
            Your next chapter.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            From board elections to neighborhood priorities, keep community decisions close to home.
          </p>
        </div>
      </div>
      <div className="border-t border-[#d8e2d9] pt-10">
        <p className="eyebrow mb-7">From joining to having your say</p>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            [
              "01",
              "Find your people",
              "Choose your community and confirm its membership statements."
            ],
            [
              "02",
              "Check your inbox",
              "Verify your email with a private link. No password needed."
            ],
            [
              "03",
              "Make your choice",
              "Open your ballot, review your selection, and submit your vote."
            ]
          ].map(([n, title, body]) => (
            <article key={n}>
              <span className="text-sm font-semibold text-emerald-700">{n}</span>
              <h2 className="mb-2 mt-3 text-xl font-semibold">{title}</h2>
              <p className="text-sm leading-relaxed text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
