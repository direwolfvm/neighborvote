import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "NeighborVote · Your neighborhood, your voice", template: "%s · NeighborVote" },
  description: "Simple, trust-based voting for neighborhood communities."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
        >
          Skip to content
        </a>
        <div className="page">
          <header className="site-header">
            <div className="site-shell">
              <Link href="/" className="brand">
                Neighbor<span className="text-emerald-700">Vote</span>
                <span className="ml-1 text-emerald-600" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <nav className="nav" aria-label="Main navigation">
                <Link href="/communities" className="nav-link">
                  Communities
                </Link>
                <Link href="/member" className="nav-link">
                  My elections
                </Link>
                <Link href="/member/login" className="nav-link">
                  Sign in
                </Link>
              </nav>
            </div>
          </header>
          <main id="main" className="site-main">
            {children}
          </main>
          <footer className="border-t border-[#dce5dc]">
            <div className="site-shell text-xs text-slate-600">
              <p>NeighborVote · A little closer to your community.</p>
              <nav className="flex gap-5" aria-label="Footer">
                <Link href="/help" className="underline">
                  Help & privacy
                </Link>
                <Link href="/admin" className="underline">
                  Community managers
                </Link>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
