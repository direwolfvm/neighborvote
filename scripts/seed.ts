import { db } from "@/db/client";
import { elections } from "@/db/schema";

async function main() {
  const sampleBallot = {
    title: "Neighborhood Board Election",
    choices: [
      { id: "candidate_a", label: "Candidate A" },
      { id: "candidate_b", label: "Candidate B" },
      { id: "abstain", label: "Abstain" }
    ]
  };

  await db.insert(elections).values({
    name: "Initial Sample Election",
    description: "Seeded election for local testing",
    status: "scheduled",
    opensAt: new Date(Date.now() + 1000 * 60 * 60),
    closesAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    ballotJson: sampleBallot,
    ballotVersion: "v1"
  });

  console.log("Seed completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
