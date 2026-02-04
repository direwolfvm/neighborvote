import { describe, expect, it } from "vitest";
import { parseGcsPath } from "@/lib/results-export";

describe("parseGcsPath", () => {
  it("parses gs path", () => {
    expect(parseGcsPath("gs://bucket-name/exports/abc.zip")).toEqual({
      bucket: "bucket-name",
      objectName: "exports/abc.zip"
    });
  });

  it("throws for invalid path", () => {
    expect(() => parseGcsPath("https://example.com")).toThrow();
  });
});
