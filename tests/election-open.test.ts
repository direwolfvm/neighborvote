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
