export function shouldSendOpenElectionNotification(params: {
  status: "draft" | "scheduled" | "open" | "closed" | "archived";
  opensAt: Date | null;
  notificationSentAt: Date | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (params.status !== "open") return false;
  if (params.notificationSentAt) return false;
  if (params.opensAt && params.opensAt > now) return false;
  return true;
}
