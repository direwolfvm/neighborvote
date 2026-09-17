import { afterEach, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocoding";
const address = {
  street: "4600 Silver Hill Rd",
  city: "Washington",
  state: "DC",
  postalCode: "20233"
};
const match = {
  matchedAddress: "4600 SILVER HILL RD, WASHINGTON, DC, 20233",
  coordinates: { x: -76.92, y: 38.84 },
  addressComponents: { zip: "20233", state: "DC" }
};
afterEach(() => vi.unstubAllGlobals());
it("uses server-returned coordinates for a single consistent match", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: { addressMatches: [match] } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await geocodeAddress(address)).toMatchObject({
    provider: "us-census",
    longitude: -76.92,
    latitude: 38.84
  });
  expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
  expect(fetcher.mock.calls[0][0].hostname).toBe("geocoding.geo.census.gov");
});
it.each([
  [[]],
  [[match, match]],
  [[{ ...match, addressComponents: { zip: "99999", state: "DC" } }]]
])("rejects missing, ambiguous, or inconsistent matches", async (matches) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ result: { addressMatches: matches } }))
  );
  await expect(geocodeAddress(address)).rejects.toThrow("address_unmatched");
});
it("handles provider timeouts without treating the address as eligible", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  await expect(geocodeAddress(address)).rejects.toThrow("geocoder_unavailable");
});
