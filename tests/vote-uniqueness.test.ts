import { describe, expect, it } from "vitest";
import { isVoteUniqueViolation } from "@/lib/db-errors";

describe("vote uniqueness handling", () => {
  it("identifies duplicate vote constraint violations", () => {
    const error = {
      code: "23505",
      constraint: "votes_election_member_unique"
    };

    expect(isVoteUniqueViolation(error)).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isVoteUniqueViolation({ code: "23505", constraint: "members_email_unique" })).toBe(false);
    expect(isVoteUniqueViolation({ code: "22001" })).toBe(false);
  });
});
