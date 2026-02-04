export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAdminEmails(input: string | undefined): Set<string> {
  if (!input) return new Set();
  return new Set(
    input
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}
