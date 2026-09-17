import { expect, it } from "vitest";
import { ballotSchema } from "@/lib/ballot";
it("rejects duplicate choice IDs, blank labels, or a single choice", () => {
  expect(
    ballotSchema.safeParse({
      title: "Vote",
      choices: [
        { id: "a", label: "A" },
        { id: "a", label: "B" }
      ]
    }).success
  ).toBe(false);
  expect(
    ballotSchema.safeParse({
      title: "Vote",
      choices: [
        { id: "a", label: " " },
        { id: "b", label: "B" }
      ]
    }).success
  ).toBe(false);
  expect(
    ballotSchema.safeParse({ title: "Vote", choices: [{ id: "a", label: "A" }] }).success
  ).toBe(false);
});
