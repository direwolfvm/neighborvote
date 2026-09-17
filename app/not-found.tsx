import Link from "next/link";
export default function NotFound() {
  return (
    <section className="card mx-auto max-w-lg space-y-5">
      <p className="eyebrow">A different direction</p>
      <h1 className="text-3xl font-semibold">We couldn’t find that page.</h1>
      <p className="text-slate-600">
        The link may be incomplete, or the election may not be published yet.
      </p>
      <Link className="btn" href="/communities">
        Find your community
      </Link>
    </section>
  );
}
