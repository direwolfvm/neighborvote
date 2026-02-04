import Link from "next/link";

export default function HomePage() {
  return (
    <section className="card space-y-3">
      <h1 className="text-2xl font-semibold">NeighborVote</h1>
      <p>Electronic voting for neighborhood associations.</p>
      <div className="flex gap-3">
        <Link href="/register" className="btn">
          Register
        </Link>
        <Link href="/admin" className="btn-secondary">
          Admin
        </Link>
      </div>
    </section>
  );
}
