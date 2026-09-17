export interface ElectionRecord {
  status: "draft" | "scheduled" | "open" | "closed" | "archived";
  opensAt: Date | null;
  closesAt: Date | null;
}

export function isElectionOpen(election: ElectionRecord, now = new Date()): boolean {
  if (election.status !== "open" && election.status !== "scheduled") return false;
  if (election.status === "scheduled" && !election.opensAt) return false;
  if (election.opensAt && election.opensAt > now) return false;
  if (election.closesAt && election.closesAt <= now) return false;
  return true;
}

export function electionStatusLabel(election: ElectionRecord, now = new Date()): string {
  if (isElectionOpen(election, now)) return "Voting open";
  if (election.status === "archived") return "Archived";
  if (election.status === "closed" || (election.closesAt && election.closesAt <= now))
    return "Voting closed";
  if (election.status === "draft") return "Draft";
  return "Upcoming";
}
