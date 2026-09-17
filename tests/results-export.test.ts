import { describe, expect, it } from "vitest";
import { buildManifest, buildVotesCsv, sha256Hex } from "@/lib/results-export";

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
    expect(csv).toContain(
      JSON.stringify({ choiceId: "candidate_a", note: 'He said "yes"' }).replaceAll('"', '""')
    );
    expect(csv).toContain('"{""choiceId"":""candidate_a""');
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

it("neutralizes spreadsheet formulas in identity fields", () => {
  const csv = buildVotesCsv([
    {
      memberId: "m",
      fullName: "=HYPERLINK(1)",
      email: "+test@example.com",
      ballotVersion: "v1",
      votePayloadJson: { choiceId: "a" },
      castAt: new Date(0)
    }
  ]);
  expect(csv).toContain("'=HYPERLINK(1)");
  expect(csv).toContain("'+test@example.com");
});

it("exports electronic, manual, and combined results without losing zero-vote choices", async () => {
  const { buildResultsCsv } = await import("@/lib/results-export");
  const csv = buildResultsCsv(
    [
      {
        memberId: "m",
        fullName: "Member",
        email: "m@example.com",
        ballotVersion: "v1",
        votePayloadJson: { choiceId: "yes" },
        castAt: new Date(0)
      }
    ],
    [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" }
    ],
    [{ choiceId: "yes", count: 2 }]
  );
  expect(csv).toContain("yes,Yes,1,2,3");
  expect(csv).toContain("no,No,0,0,0");
});
