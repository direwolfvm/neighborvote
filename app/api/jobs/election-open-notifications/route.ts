import { NextResponse } from "next/server";
import { dispatchOpenElectionNotifications } from "@/lib/notifications";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_JOB_TOKEN;
  if (!expected) return false;
  const supplied = request.headers.get("x-cron-token");
  return supplied === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await dispatchOpenElectionNotifications({ actor: "system:cron" });
  return NextResponse.json({ ok: true, ...result });
}
