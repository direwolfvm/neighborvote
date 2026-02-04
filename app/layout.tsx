import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeighborVote",
  description: "Neighborhood electronic voting"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header className="site-header">
            <div className="site-shell">
              <Link href="/" className="brand">
                NeighborVote
              </Link>
              <nav className="nav">
                <Link href="/register" className="nav-link">
                  Register
                </Link>
                <Link href="/member/login" className="nav-link">
                  Member
                </Link>
                <Link href="/admin/login" className="nav-link">
                  Admin
                </Link>
              </nav>
            </div>
          </header>
          <main className="site-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
