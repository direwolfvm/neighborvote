import { describe, expect, it } from "vitest";
import { isElectionOpen } from "@/lib/election";

describe("isElectionOpen", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("returns true when status=open and within bounds", () => {
    expect(
      isElectionOpen(
        {
          status: "open",
          opensAt: new Date("2026-01-01T11:00:00.000Z"),
          closesAt: new Date("2026-01-01T13:00:00.000Z")
        },
        now
      )
    ).toBe(true);
  });

  it("returns false when closed or out of time window", () => {
    expect(
      isElectionOpen(
        {
          status: "closed",
          opensAt: null,
          closesAt: null
        },
        now
      )
    ).toBe(false);

    expect(
      isElectionOpen(
        {
          status: "open",
          opensAt: new Date("2026-01-01T13:00:00.000Z"),
          closesAt: null
        },
        now
      )
    ).toBe(false);
  });
});

it("opens scheduled elections at the boundary and closes at the deadline", () => {
  const start = new Date("2026-01-01T12:00:00Z");
  const end = new Date("2026-01-01T13:00:00Z");
  const election = { status: "scheduled" as const, opensAt: start, closesAt: end };
  expect(isElectionOpen(election, start)).toBe(true);
  expect(isElectionOpen(election, end)).toBe(false);
  expect(isElectionOpen({ ...election, opensAt: null }, start)).toBe(false);
});
