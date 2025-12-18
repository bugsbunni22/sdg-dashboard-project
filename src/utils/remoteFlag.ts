export type RemoteFlagRow = {
  occ_title?: string | null
  remote_flag?: string | null
}

export const normalizeOccupationTitle = (title?: string | null) =>
  (title ?? '')
    .replace(/\*+$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export function buildRemoteFlagLookup(rows: RemoteFlagRow[]): Record<string, string> {
  const normalizeFlag = (flag: string) => {
    const value = flag.trim()
    if (!value) return ''
    const lower = value.toLowerCase()
    if (lower.includes('impossible') || lower.includes('no')) return 'Remote not possible'
    return 'Remote possible'
  }

  const map = new Map<string, string>()
  for (const row of rows) {
    const normalizedTitle = normalizeOccupationTitle(row.occ_title)
    if (!normalizedTitle) continue
    const label = row.remote_flag ? normalizeFlag(row.remote_flag) : ''
    if (!label) continue
    map.set(normalizedTitle, label)
  }

  return Object.fromEntries(map.entries())
}
