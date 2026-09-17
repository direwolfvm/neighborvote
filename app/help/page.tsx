import Link from "next/link";
export default function HelpPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">A helping hand</p>
        <h1 className="text-4xl font-semibold">Here to help you take part.</h1>
        <p className="leading-relaxed text-slate-600">
          Your community manager is the best contact for membership conditions, address questions,
          and election decisions. Find their contact information on your community’s page.
        </p>
        <Link href="/communities" className="btn-secondary">
          Find my community
        </Link>
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Can’t find your email?</h2>
        <p className="leading-relaxed text-slate-600">
          Look for NeighborVote from no-reply@neighborvote.online. Check spam and junk folders, then
          request a fresh link if needed. Wait at least a minute between requests. Verification
          links last 24 hours, member sign-in links 30 minutes, and ballot links up to two hours or
          until voting closes.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How membership works</h2>
        <p className="leading-relaxed text-slate-600">
          This is trust-based community voting. You provide your own details and confirm any
          required statements. Communities may limit postal codes, block certain emails or domains,
          and optionally screen a street address against their geographic boundary. Email
          verification confirms that you can access your inbox; it does not verify your identity or
          residency. There is no document upload or approval queue.
        </p>
        <p className="leading-relaxed text-slate-600">
          If address screening is enabled, your submitted address is sent to the US Census geocoder.
          Its approximate address location is checked against the community’s boundary. Unmatched
          addresses and addresses on an edge need correction or help from your manager.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Before you submit a vote</h2>
        <p className="leading-relaxed text-slate-600">
          Each eligible member can submit one electronic vote per election. Review your choice
          carefully: submitted votes cannot be changed. Your member page shows whether your vote was
          recorded. Keep all private links to yourself.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your information & privacy</h2>
        <p className="leading-relaxed text-slate-600">
          NeighborVote stores your name, email, community memberships, membership answers, and
          election participation. If address screening is enabled, your submitted address and
          geocoding result are stored with your membership. Session cookies keep you signed in.
          Mailgun processes your email address to deliver account and election messages; click and
          open tracking are disabled.
        </p>
        <p className="leading-relaxed text-slate-600">
          Votes are linked to member accounts. Authorized community staff can access election
          results and exports that include member identities and choices. This is not a
          secret-ballot system. Community rules may change who can vote, but do not remove votes
          already recorded. Contact your community manager about access, corrections, retention, or
          removal of your data.
        </p>
      </section>
    </article>
  );
}
