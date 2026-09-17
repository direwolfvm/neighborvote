import { sql } from "drizzle-orm";
import { db } from "@/db/client";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.execute(sql`SELECT id FROM communities LIMIT 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
