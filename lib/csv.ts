export interface CsvRow {
  fullName: string;
  email: string;
}

function parseLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseMemberCsv(csvContent: string): CsvRow[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const header = parseLine(lines[0]).map((field) => field.toLowerCase());
  const nameIdx = header.findIndex((field) => field === "name" || field === "full_name");
  const emailIdx = header.findIndex((field) => field === "email");

  if (nameIdx === -1 || emailIdx === -1) {
    throw new Error("CSV must include header columns: name,email");
  }

  return lines.slice(1).map((line) => {
    const columns = parseLine(line);
    return {
      fullName: columns[nameIdx] ?? "",
      email: columns[emailIdx] ?? ""
    };
  });
}
