import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { dispatchOpenElectionNotifications } from "@/lib/notifications";

export async function POST(request: Request) {
  if (!(await isCronRequestAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchOpenElectionNotifications();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "notification_job_failed" }, { status: 503 });
  }
}
