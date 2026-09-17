import { describe, expect, it } from "vitest";
import { communityRulesSchema, evaluateCommunityRules } from "@/lib/community-rules";
import { parseBoundary, pointWithinBoundary } from "@/lib/boundary";
const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0]
    ]
  ]
};
describe("trust-based community conditions", () => {
  it("allows a verified-email applicant when optional rules are empty", () =>
    expect(evaluateCommunityRules({}, "a@example.com", {}).allowed).toBe(true));
  it("matches postal codes case-insensitively with whitespace/hyphens normalized", () => {
    expect(
      evaluateCommunityRules({ allowedPostalCodes: ["K1A 0B1"] }, "a@example.com", {
        postalCode: "k1a-0b1"
      }).allowed
    ).toBe(true);
    expect(
      evaluateCommunityRules({ allowedPostalCodes: ["22301"] }, "a@example.com", {
        postalCode: "22302"
      }).allowed
    ).toBe(false);
  });
  it("rejects blocked emails and domains, including subdomains but not suffix lookalikes", () => {
    expect(
      evaluateCommunityRules({ blockedEmails: ["A@EXAMPLE.COM"] }, "a@example.com", {}).allowed
    ).toBe(false);
    expect(
      evaluateCommunityRules({ blockedEmailDomains: ["example.com"] }, "a@mail.example.com", {})
        .allowed
    ).toBe(false);
    expect(
      evaluateCommunityRules({ blockedEmailDomains: ["example.com"] }, "a@notexample.com", {})
        .allowed
    ).toBe(true);
  });
  it("requires all current attestations, not old or unrelated answers", () => {
    const rules = {
      requiredAttestations: [
        { id: "resident", label: "I live here" },
        { id: "age", label: "I am eligible" }
      ]
    };
    expect(
      evaluateCommunityRules(rules, "a@example.com", { attestations: ["resident"] }).allowed
    ).toBe(false);
    expect(
      evaluateCommunityRules(rules, "a@example.com", { attestations: ["resident", "age"] }).allowed
    ).toBe(true);
    expect(
      communityRulesSchema.safeParse({
        requiredAttestations: [rules.requiredAttestations[0], rules.requiredAttestations[0]]
      }).success
    ).toBe(false);
  });
  it("closing self-registration does not evict existing members", () => {
    expect(
      evaluateCommunityRules({ registrationOpen: false }, "a@example.com", {}, true).allowed
    ).toBe(false);
    expect(evaluateCommunityRules({ registrationOpen: false }, "a@example.com", {}).allowed).toBe(
      true
    );
  });
  it("fails closed on corrupt policy data", () =>
    expect(
      evaluateCommunityRules({ allowedPostalCodes: "anything" }, "a@example.com", {}).allowed
    ).toBe(false));
  it("only requires a geocoding result when a boundary is enabled", () => {
    expect(evaluateCommunityRules({ boundary: square }, "a@example.com", {}).allowed).toBe(false);
    const geocode = {
      provider: "us-census",
      longitude: 5,
      latitude: 5,
      matchedAddress: "Sample address",
      screenedAt: "2026-09-16T12:00:00.000Z"
    };
    expect(evaluateCommunityRules({ boundary: square }, "a@example.com", { geocode }).allowed).toBe(
      true
    );
    expect(
      evaluateCommunityRules({ boundary: square }, "a@example.com", {
        geocode: { ...geocode, longitude: 12 }
      }).allowed
    ).toBe(false);
  });
});
describe("GIS boundary screening", () => {
  it("accepts GIS Feature and single-feature FeatureCollection exports", () => {
    const feature = { type: "Feature", properties: { name: "Neighborhood" }, geometry: square };
    expect(parseBoundary(feature)).toEqual(square);
    expect(parseBoundary({ type: "FeatureCollection", features: [feature] })).toEqual(square);
  });
  it("distinguishes inside, outside, and exact edges", () => {
    const b = parseBoundary(square);
    expect(pointWithinBoundary(5, 5, b)).toBe(true);
    expect(pointWithinBoundary(11, 5, b)).toBe(false);
    expect(pointWithinBoundary(0, 5, b)).toBe(false);
    expect(pointWithinBoundary(0, 0, b)).toBe(false);
  });
  it("respects polygon holes and disjoint multipolygons", () => {
    const b = parseBoundary({
      ...square,
      coordinates: [
        ...square.coordinates,
        [
          [3, 3],
          [3, 7],
          [7, 7],
          [7, 3],
          [3, 3]
        ]
      ]
    });
    expect(pointWithinBoundary(5, 5, b)).toBe(false);
    expect(pointWithinBoundary(2, 2, b)).toBe(true);
    const multi = parseBoundary({
      type: "MultiPolygon",
      coordinates: [
        square.coordinates,
        [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20]
          ]
        ]
      ]
    });
    expect(pointWithinBoundary(25, 25, multi)).toBe(true);
    expect(pointWithinBoundary(15, 15, multi)).toBe(false);
  });
  it("rejects malformed coordinates and open rings", () => {
    expect(() =>
      parseBoundary({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ]
        ]
      })
    ).toThrow();
    expect(() => parseBoundary({ type: "Point", coordinates: [1, 2] })).toThrow();
    expect(() =>
      parseBoundary({
        type: "Polygon",
        coordinates: [
          [
            [999, 0],
            [10, 0],
            [10, 10],
            [999, 0]
          ]
        ]
      })
    ).toThrow();
  });
});
