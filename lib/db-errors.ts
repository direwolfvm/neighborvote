export interface PgErrorLike {
  code?: string;
  constraint?: string;
  cause?: unknown;
}
export function isVoteUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const pgError = current as PgErrorLike;
    if (pgError.code === "23505" && pgError.constraint === "votes_election_member_unique")
      return true;
    current = pgError.cause;
  }
  return false;
}
