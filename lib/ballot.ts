import { z } from "zod";

export const ballotSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    choices: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          label: z.string().trim().min(1).max(200)
        })
      )
      .min(2)
      .max(100)
  })
  .refine(
    (ballot) => new Set(ballot.choices.map((choice) => choice.id)).size === ballot.choices.length,
    "Choice IDs must be unique"
  );

export type Ballot = z.infer<typeof ballotSchema>;

export function parseBallotJson(input: string): Ballot {
  const parsedJson: unknown = JSON.parse(input);
  return ballotSchema.parse(parsedJson);
}
