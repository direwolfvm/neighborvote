import { describe, expect, it } from "vitest";
import { shouldSendOpenElectionNotification } from "@/lib/notification-rules";

describe("shouldSendOpenElectionNotification", () => {
  const now = new Date("2026-02-04T18:00:00.000Z");

  it("returns true for open election with no opensAt and not yet sent", () => {
    expect(
      shouldSendOpenElectionNotification({
        status: "open",
        opensAt: null,
        notificationSentAt: null,
        now
      })
    ).toBe(true);
  });

  it("returns true when opensAt has passed", () => {
    expect(
      shouldSendOpenElectionNotification({
        status: "open",
        opensAt: new Date("2026-02-04T17:59:00.000Z"),
        notificationSentAt: null,
        now
      })
    ).toBe(true);
  });

  it("returns false when opensAt is in the future or already sent", () => {
    expect(
      shouldSendOpenElectionNotification({
        status: "open",
        opensAt: new Date("2026-02-04T18:30:00.000Z"),
        notificationSentAt: null,
        now
      })
    ).toBe(false);

    expect(
      shouldSendOpenElectionNotification({
        status: "open",
        opensAt: null,
        notificationSentAt: new Date("2026-02-04T18:00:00.000Z"),
        now
      })
    ).toBe(false);
  });
});
