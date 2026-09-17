import { z } from "zod";
import { boundarySchema, pointWithinBoundary } from "@/lib/boundary";
import { addressSchema, geocodeSchema } from "@/lib/geocoding";

const list = z.array(z.string().trim().min(1).max(320)).max(500).default([]);
export const communityRulesSchema = z
  .object({
    boundary: boundarySchema.nullable().default(null),
    registrationOpen: z.boolean().default(true),
    allowedPostalCodes: list,
    blockedEmails: list,
    blockedEmailDomains: list,
    requiredAttestations: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-z0-9_-]+$/)
            .max(50),
          label: z.string().trim().min(1).max(500)
        })
      )
      .max(20)
      .default([])
  })
  .superRefine((rules, ctx) => {
    if (
      new Set(rules.requiredAttestations.map((item) => item.id)).size !==
      rules.requiredAttestations.length
    )
      ctx.addIssue({ code: "custom", message: "Attestation IDs must be unique" });
  });
export type CommunityRules = z.infer<typeof communityRulesSchema>;
export const registrationAnswersSchema = z.object({
  address: addressSchema.optional(),
  geocode: geocodeSchema.optional(),
  postalCode: z.string().trim().max(20).default(""),
  attestations: z.array(z.string().max(50)).max(20).default([])
});
export type RegistrationAnswers = z.infer<typeof registrationAnswersSchema>;
export function normalizePostalCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

/** Closed registration stops new joins; current members still use all eligibility conditions. */
export function evaluateCommunityRules(
  rawRules: unknown,
  email: string,
  rawAnswers: unknown,
  joining = false
): { allowed: boolean; reason?: string } {
  const rules = communityRulesSchema.safeParse(rawRules);
  const answers = registrationAnswersSchema.safeParse(rawAnswers);
  if (!rules.success || !answers.success)
    return {
      allowed: false,
      reason:
        "This community’s registration settings need attention. Contact your community manager."
    };
  if (joining && !rules.data.registrationOpen)
    return { allowed: false, reason: "This community is not accepting registrations right now." };
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split("@")[1] || "";
  if (
    rules.data.blockedEmails.some((item) => item.toLowerCase() === normalizedEmail) ||
    rules.data.blockedEmailDomains.some(
      (item) => domain === item.toLowerCase() || domain.endsWith(`.${item.toLowerCase()}`)
    )
  )
    return {
      allowed: false,
      reason:
        "This email address does not meet the community’s registration conditions. Contact your community manager."
    };
  if (
    rules.data.allowedPostalCodes.length &&
    !rules.data.allowedPostalCodes.some(
      (code) => normalizePostalCode(code) === normalizePostalCode(answers.data.postalCode)
    )
  )
    return {
      allowed: false,
      reason: "Your postal code is outside this community’s eligible area."
    };
  if (rules.data.requiredAttestations.some((item) => !answers.data.attestations.includes(item.id)))
    return { allowed: false, reason: "Please confirm every required membership statement." };
  if (rules.data.boundary) {
    if (!answers.data.geocode)
      return { allowed: false, reason: "Please complete address screening for this community." };
    if (
      !pointWithinBoundary(
        answers.data.geocode.longitude,
        answers.data.geocode.latitude,
        rules.data.boundary
      )
    )
      return {
        allowed: false,
        reason:
          "This address is outside or on the edge of the community boundary. Contact your community manager if you believe this is incorrect."
      };
  }
  return { allowed: true };
}
