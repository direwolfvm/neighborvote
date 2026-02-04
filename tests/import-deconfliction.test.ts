import { describe, expect, it } from "vitest";
import { deconflictImportRows } from "@/lib/imports";

describe("deconflictImportRows", () => {
  it("merges duplicates by case-insensitive email", () => {
    const rows = deconflictImportRows([
      { fullName: "Alice", email: "ALICE@example.com" },
      { fullName: "Alice B", email: "alice@example.com" },
      { fullName: "Bob", email: "bob@example.com" }
    ]);

    expect(rows).toHaveLength(2);

    const alice = rows.find((row) => row.email === "alice@example.com");
    expect(alice?.mergedCount).toBe(2);
    expect(alice?.fullName).toBe("Alice B");
  });
});
