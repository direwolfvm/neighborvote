"use client";
import Link from "next/link";
export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card mx-auto max-w-lg space-y-5">
      <p className="eyebrow">Let’s try that again</p>
      <h1 className="text-3xl font-semibold">We hit a temporary snag.</h1>
      <p className="leading-relaxed text-slate-600">
        Please try again in a moment. If you were voting, check your elections page to see whether
        your vote was recorded.
      </p>
      <div className="flex gap-3">
        <button className="btn" onClick={reset}>
          Try again
        </button>
        <Link className="btn-secondary" href="/member">
          My elections
        </Link>
      </div>
    </section>
  );
}
