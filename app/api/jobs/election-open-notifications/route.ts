import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchOpenElectionNotifications } from "@/lib/notifications";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_JOB_TOKEN;
  if (!expected) return false;
  const supplied = request.headers.get("x-cron-token");
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchOpenElectionNotifications();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "notification_job_failed" }, { status: 503 });
  }
}
