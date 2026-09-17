import { z } from "zod";
export const addressSchema = z.object({
  street: z.string().trim().min(3).max(100),
  city: z.string().trim().min(2).max(100),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase()),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(?:-\d{4})?$/)
});
export const geocodeSchema = z.object({
  provider: z.literal("us-census"),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  matchedAddress: z.string().max(500),
  screenedAt: z.string().datetime()
});
export type Geocode = z.infer<typeof geocodeSchema>;
export class AddressScreeningError extends Error {
  constructor(public readonly code: "address_unmatched" | "geocoder_unavailable") {
    super(code);
  }
}

/** Coordinates come only from the server-side provider response, never from a submitted form. */
export async function geocodeAddress(raw: unknown): Promise<Geocode> {
  const address = addressSchema.parse(raw);
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/address");
  Object.entries({
    street: address.street,
    city: address.city,
    state: address.state,
    zip: address.postalCode,
    benchmark: "Public_AR_Current",
    format: "json"
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  let data: unknown;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
      redirect: "error"
    });
    if (!response.ok) throw new Error("unavailable");
    data = await response.json();
  } catch {
    throw new AddressScreeningError("geocoder_unavailable");
  }
  const parsed = z
    .object({
      result: z.object({
        addressMatches: z.array(
          z.object({
            matchedAddress: z.string().max(500),
            coordinates: z.object({
              x: z.number().min(-180).max(180),
              y: z.number().min(-90).max(90)
            }),
            addressComponents: z.object({ zip: z.string(), state: z.string() })
          })
        )
      })
    })
    .safeParse(data);
  if (!parsed.success || parsed.data.result.addressMatches.length !== 1)
    throw new AddressScreeningError("address_unmatched");
  const match = parsed.data.result.addressMatches[0];
  if (
    match.addressComponents.zip.slice(0, 5) !== address.postalCode.slice(0, 5) ||
    match.addressComponents.state !== address.state
  )
    throw new AddressScreeningError("address_unmatched");
  return {
    provider: "us-census",
    longitude: match.coordinates.x,
    latitude: match.coordinates.y,
    matchedAddress: match.matchedAddress,
    screenedAt: new Date().toISOString()
  };
}
