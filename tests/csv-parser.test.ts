import { describe, expect, it } from "vitest";
import { parseMemberCsv } from "@/lib/csv";

describe("parseMemberCsv", () => {
  it("parses name,email rows", () => {
    const rows = parseMemberCsv("name,email\nAlice,alice@example.com\nBob,bob@example.com\n");
    expect(rows).toEqual([
      { fullName: "Alice", email: "alice@example.com" },
      { fullName: "Bob", email: "bob@example.com" }
    ]);
  });

  it("supports quoted cells and escaped quotes", () => {
    const rows = parseMemberCsv('name,email\n"Alice \"\"A\"\"",alice@example.com\n');
    expect(rows[0].fullName).toBe('Alice "A"');
  });

  it("throws when required headers are missing", () => {
    expect(() => parseMemberCsv("full_name\nAlice\n")).toThrow();
  });
});
