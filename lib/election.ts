export interface ElectionRecord {
  status: "draft" | "scheduled" | "open" | "closed" | "archived";
  opensAt: Date | null;
  closesAt: Date | null;
}

export function isElectionOpen(election: ElectionRecord, now = new Date()): boolean {
  if (election.status !== "open") return false;
  if (election.opensAt && election.opensAt > now) return false;
  if (election.closesAt && election.closesAt <= now) return false;
  return true;
}
