import { z } from "zod";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import booleanValid from "@turf/boolean-valid";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z
  .array(position)
  .min(4)
  .max(2000)
  .refine(
    (points) => points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1],
    "Boundary rings must be closed"
  );
export const boundarySchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1).max(50) }),
    z.object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(z.array(ring).min(1).max(50)).min(1).max(50)
    })
  ])
  .superRefine((geometry, context) => {
    const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
    if (
      rings.reduce((total, item) => total + item.length, 0) > 5000 ||
      rings.some((points) =>
        points.some((point, i) => i > 0 && Math.abs(point[0] - points[i - 1][0]) > 180)
      ) ||
      !booleanValid(geometry)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Use a valid neighborhood boundary with at most 5,000 vertices, without crossing the antimeridian"
      });
    }
  });
export type Boundary = z.infer<typeof boundarySchema>;

/** Accept a geometry, a Feature, or a single-feature GIS export. */
export function parseBoundary(raw: unknown): Boundary {
  let value = raw;
  if (value && typeof value === "object" && "type" in value) {
    if (
      value.type === "FeatureCollection" &&
      "features" in value &&
      Array.isArray(value.features) &&
      value.features.length === 1
    )
      value = value.features[0];
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "Feature" &&
      "geometry" in value
    )
      value = value.geometry;
  }
  return boundarySchema.parse(value);
}

export function pointWithinBoundary(
  longitude: number,
  latitude: number,
  boundary: Boundary
): boolean {
  // Edge addresses require correction/contact rather than an automatic admission.
  return booleanPointInPolygon([longitude, latitude], boundary, { ignoreBoundary: true });
}
