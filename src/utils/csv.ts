// src/utils/csv.ts
export async function fetchCSV(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url);
  const text = await res.text();

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Record<string, string>[] = [];
  if (!lines.length) return out;

  const headers = parseCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (fields[idx] ?? "").trim();
    });
    out.push(row);
  }
  return out;
}

/** 따옴표로 감싼 필드 내 쉼표/따옴표 이스케이프 처리 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // "" → " (escape)
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}
