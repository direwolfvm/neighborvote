export interface PgErrorLike {
  code?: string;
  constraint?: string;
}

export function isVoteUniqueViolation(error: unknown): boolean {
  const pgError = error as PgErrorLike;
  return pgError?.code === "23505" && pgError?.constraint === "votes_election_member_unique";
}
