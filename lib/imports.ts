import { normalizeEmail } from "@/lib/email";

export interface ImportRow {
  fullName: string;
  email: string;
}

export interface DeconflictedImportRow {
  fullName: string;
  email: string;
  mergedCount: number;
}

export function deconflictImportRows(rows: ImportRow[]): DeconflictedImportRow[] {
  const map = new Map<string, DeconflictedImportRow>();

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const fullName = row.fullName.trim();
    if (!email || !fullName) continue;

    const existing = map.get(email);
    if (!existing) {
      map.set(email, { email, fullName, mergedCount: 1 });
      continue;
    }

    existing.fullName = fullName.length > existing.fullName.length ? fullName : existing.fullName;
    existing.mergedCount += 1;
  }

  return [...map.values()];
}
