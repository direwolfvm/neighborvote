import { isElectionOpen } from "@/lib/election";
export function shouldSendOpenElectionNotification(params: {
  status: "draft" | "scheduled" | "open" | "closed" | "archived";
  opensAt: Date | null;
  closesAt?: Date | null;
  notificationSentAt: Date | null;
  now?: Date;
}): boolean {
  return (
    !params.notificationSentAt &&
    isElectionOpen({ ...params, closesAt: params.closesAt ?? null }, params.now)
  );
}
