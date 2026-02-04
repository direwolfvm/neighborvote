import { z } from "zod";

export const ballotSchema = z.object({
  title: z.string().min(1).max(200),
  choices: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(200)
      })
    )
    .min(1)
});

export type Ballot = z.infer<typeof ballotSchema>;

export function parseBallotJson(input: string): Ballot {
  const parsedJson: unknown = JSON.parse(input);
  return ballotSchema.parse(parsedJson);
}
