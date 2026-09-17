import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { db, pool } = await import("@/db/client");
  const { communities, elections } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  if (process.env.NODE_ENV === "production")
    throw new Error("Sample data is for local development only");
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, "neighborvote"))
    .limit(1);
  if (!community) throw new Error("Run migrations before seeding");
  await db
    .insert(elections)
    .values({
      id: "84d23800-dfb5-4ffb-902e-624182d88b66",
      communityId: community.id,
      name: "Our neighborhood priorities",
      description: "A sample ballot for local testing. What should our community focus on next?",
      status: "open",
      ballotJson: {
        title: "Which project should we prioritize?",
        choices: [
          { id: "trees", label: "More trees and green space" },
          { id: "paths", label: "Safer walking routes" },
          { id: "events", label: "More community events" }
        ]
      },
      ballotVersion: "v1"
    })
    .onConflictDoNothing();
  console.log("Sample election ready");
  await pool.end();
}
main().catch(() => {
  console.error("Seed failed. Check local database configuration.");
  process.exit(1);
});
