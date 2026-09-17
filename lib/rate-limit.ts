import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sha256Hex } from "@/lib/crypto";

/** Shared across all app instances and link types; identifiers are hashed at rest. */
export async function allowEmailRequest(email: string): Promise<boolean> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const quotas = [
      { scope: `email:${email}`, seconds: 60, limit: 1 },
      { scope: `email:${email}`, seconds: 3600, limit: 5 },
      { scope: "global", seconds: 60, limit: 100 }
    ];
    for (const quota of quotas) {
      const bucket = Math.floor(now / (quota.seconds * 1000));
      const key = sha256Hex(`${quota.scope}:${quota.seconds}:${bucket}`);
      const expires = new Date((bucket + 1) * quota.seconds * 1000);
      const result = await tx.execute(sql`
        INSERT INTO email_rate_limits (key, count, expires_at) VALUES (${key}, 1, ${expires})
        ON CONFLICT (key) DO UPDATE SET count = email_rate_limits.count + 1
        WHERE email_rate_limits.count < ${quota.limit}
        RETURNING count
      `);
      if (result.rows.length === 0) return false;
    }
    return true;
  });
}
