import { describe, expect, it } from "vitest";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";

describe("token utilities", () => {
  it("generates URL-safe opaque tokens", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes token to fixed SHA256 hex", () => {
    const hash = sha256Hex("abc123");
    expect(hash).toHaveLength(64);
    expect(hash).toBe("6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d23925329c3e4a8a1f6f");
  });
});
