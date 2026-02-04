import { describe, expect, it } from "vitest";
import {
  buildManifest,
  buildVotesCsv,
  sha256Hex
} from "@/lib/results-export";

describe("results export helpers", () => {
  it("builds CSV with escaped values", () => {
    const csv = buildVotesCsv([
      {
        memberId: "m1",
        fullName: "Alice, Example",
        email: "alice@example.com",
        ballotVersion: "v1",
        votePayloadJson: { choiceId: "candidate_a", note: 'He said "yes"' },
        castAt: new Date("2026-01-01T12:00:00.000Z")
      }
    ]);

    expect(csv).toContain("member_id,full_name,email,ballot_version,vote_payload_json,cast_at");
    expect(csv).toContain('"Alice, Example"');
    expect(csv).toContain('"{""choiceId"":""candidate_a""');
    expect(csv).toContain('He said \\"yes\\"');
  });

  it("builds manifest with expected metadata", () => {
    const manifest = buildManifest({
      electionId: "e-1",
      electionName: "Board Election",
      generatedAt: "2026-01-01T12:00:00.000Z",
      voteCount: 3,
      files: [{ path: "votes.csv", sha256: "abc", bytes: 10 }]
    });

    expect(manifest).toMatchObject({
      version: 1,
      election_id: "e-1",
      election_name: "Board Election",
      vote_count: 3
    });
  });

  it("hashes deterministically", () => {
    const hash1 = sha256Hex("neighborvote");
    const hash2 = sha256Hex("neighborvote");
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });
});
