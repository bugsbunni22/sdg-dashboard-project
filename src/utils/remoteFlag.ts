// src/utils/remoteFlag.ts

export type RemoteFlagRow = {
  prim_state?: string | null
  occ_title?: string | null
  tot_emp?: string | number | null
  remote_flag?: string | null
}

const REMOTE_SCORE: Record<string, number> = {
  Yes: 1,
  Possible: 0.5,
  No: 0
}

/**
 * Build employment-weighted remote work feasibility by state
 */
export function buildRemoteWorkByState(
  rows: RemoteFlagRow[]
): Record<string, number> {
  const acc: Record<string, { weighted: number; totalEmp: number }> = {}

  for (const row of rows) {
    const state = row.prim_state?.trim()
    if (!state) continue

    const emp = Number(row.tot_emp ?? 0)
    if (!Number.isFinite(emp) || emp <= 0) continue

    const flag = (row.remote_flag ?? '').trim()
    const score = REMOTE_SCORE[flag] ?? 0

    acc[state] ??= { weighted: 0, totalEmp: 0 }
    acc[state].weighted += score * emp
    acc[state].totalEmp += emp
  }

  const result: Record<string, number> = {}
  for (const [state, v] of Object.entries(acc)) {
    if (v.totalEmp > 0) {
      result[state] = v.weighted / v.totalEmp
    }
  }

  return result
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
