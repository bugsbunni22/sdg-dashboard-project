// src/App.tsx
import React from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import SdgChoropleth from './components/SdgChoropleth'
import CountyValueLabels from './components/CountyValueLabels'
import countiesGeojsonRaw from './data/counties_500k.json'
import statesGeojsonRaw from './data/usa_state_20m.json'
import msaToCountiesRows from './data/msaTOcounties.json'
import employmentRowsData from './data/emp_AnnualSalary.json'
import { buildMsaToCountiesFromList } from './utils/crosswalk'

type Row = { area_name: string; sdg: string; sdg_lq: number }
type EungMsa = Row[]
type MetricsByCounty = Record<string, Record<string, number>>
type StateRow = { state_num: number; state_name: string; sdg: string; sdg_lq: number }
type StateEung = StateRow[]
type MetricsByState = Record<string, Record<string, number>>
type EmploymentRow = {
  year: number
  total_code: string
  total_title: string
  tot_emp: number
  annual_w: number
  sdg: string
}
type MapPage = 'msa' | 'state' | 'employment'

function sortSdgKeys(keys: string[]) {
  const rx = /^SDG-(\d{1,2})$/i
  return [...keys].sort((a, b) => {
    const ma = a.match(rx), mb = b.match(rx)
    if (ma && mb) return Number(ma[1]) - Number(mb[1])
    return a.localeCompare(b)
  })
}

// Eager-import MSA JSON per year
const msaYearModules = import.meta.glob('./data/msa_json/msa_*.json', { eager: true }) as Record<string, { default: EungMsa }>

const allYearsData: Record<number, EungMsa> = Object.fromEntries(
  Object.entries(msaYearModules)
    .map(([path, mod]) => {
      const m = path.match(/msa_(\d{4})\.json$/)
      const yr = m ? Number(m[1]) : NaN
      return Number.isFinite(yr) ? [yr, mod.default] as const : null
    })
    .filter(Boolean) as [number, EungMsa][]
)

const stateYearModules = import.meta.glob('./data/msa_state_json/msa_state_*.json', { eager: true }) as Record<string, { default: StateEung }>

const allStateYearsData: Record<number, StateEung> = Object.fromEntries(
  Object.entries(stateYearModules)
    .map(([path, mod]) => {
      const m = path.match(/msa_state_(\d{4})\.json$/)
      const yr = m ? Number(m[1]) : NaN
      return Number.isFinite(yr) ? [yr, mod.default] as const : null
    })
    .filter(Boolean) as [number, StateEung][]
)

const MSA_AVAILABLE_YEARS = Object.keys(allYearsData).map(Number).sort((a, b) => a - b)
const STATE_AVAILABLE_YEARS = Object.keys(allStateYearsData).map(Number).sort((a, b) => a - b)
const employmentRows: EmploymentRow[] = (employmentRowsData as EmploymentRow[]) ?? []
const EMPLOYMENT_OCCUPATIONS = Array.from(new Set(employmentRows.map((row) => row.total_title))).sort((a, b) =>
  a.localeCompare(b)
)
const STANDARD_SDG_CODES = Array.from({ length: 16 }, (_, i) => `SDG-${String(i + 1).padStart(2, '0')}`)
const EMPLOYMENT_SDGS = STANDARD_SDG_CODES.filter((code) =>
  employmentRows.some((row) => row.sdg === code)
)
const MAP_TABS: { id: MapPage; label: string }[] = [
  { id: 'msa', label: 'MSA Map' },
  { id: 'state', label: 'State Map' },
  { id: 'employment', label: 'Employment Insights' }
]
const CONTIGUOUS_US_BOUNDS: LatLngBoundsExpression = [
  [24.396308, -124.848974],
  [49.384358, -66.885444]
]

export default function App() {
  // Ensure GEOID exists on county features (STATE+COUNTY fallback)
  const countyGeojson = React.useMemo(() => {
    const fc: any = countiesGeojsonRaw as any
    if (!fc?.features) return fc
    return {
      ...fc,
      features: fc.features.map((f: any) => {
        const p = f.properties || {}
        const geoid = p.GEOID ?? (String(p.STATE ?? '').padStart(2, '0') + String(p.COUNTY ?? '').padStart(3, '0'))
        return { ...f, properties: { ...p, GEOID: geoid } }
      })
    }
  }, [])

  const stateGeojson = React.useMemo(() => {
    const fc: any = statesGeojsonRaw as any
    if (!fc?.features) return fc
    return {
      ...fc,
      features: fc.features.map((f: any) => {
        const p = f.properties || {}
        const stateId = String(p.STATE ?? '').padStart(2, '0')
        return { ...f, properties: { ...p, STATE: stateId } }
      })
    }
  }, [])

  const [activePage, setActivePage] = React.useState<MapPage>('msa')
  const [activeYear, setActiveYear] = React.useState<number>(MSA_AVAILABLE_YEARS.at(-1) ?? 2000)
  const [activeSdg, setActiveSdg] = React.useState('SDG-01')
  const [activeMsa, setActiveMsa] = React.useState<string | null>(null)
  const [showLabels, setShowLabels] = React.useState(true)
  const [activeStateYear, setActiveStateYear] = React.useState<number>(STATE_AVAILABLE_YEARS.at(-1) ?? 2000)
  const [activeStateSdg, setActiveStateSdg] = React.useState('SDG-01')
  const [employmentFilterType, setEmploymentFilterType] = React.useState<'occupation' | 'sdg'>('occupation')
  const [activeEmploymentOccupation, setActiveEmploymentOccupation] = React.useState<string>(EMPLOYMENT_OCCUPATIONS[0] ?? '')
  const [activeEmploymentSdg, setActiveEmploymentSdg] = React.useState<string>(EMPLOYMENT_SDGS[0] ?? '')

  React.useEffect(() => {
    if (employmentFilterType === 'occupation' && !activeEmploymentOccupation && EMPLOYMENT_OCCUPATIONS[0]) {
      setActiveEmploymentOccupation(EMPLOYMENT_OCCUPATIONS[0])
    }
    if (employmentFilterType === 'sdg' && !activeEmploymentSdg && EMPLOYMENT_SDGS[0]) {
      setActiveEmploymentSdg(EMPLOYMENT_SDGS[0])
    }
  }, [employmentFilterType, activeEmploymentOccupation, activeEmploymentSdg])

  const eung: EungMsa = React.useMemo(() => allYearsData[activeYear] ?? [], [activeYear])
  const stateEung: StateEung = React.useMemo(() => allStateYearsData[activeStateYear] ?? [], [activeStateYear])

  // Crosswalk: MSA Title -> list of county GEOIDs
  const msaToCounties = React.useMemo(() => {
    try {
      const rows = (msaToCountiesRows as unknown) as Record<string, any>[]
      return buildMsaToCountiesFromList(rows)
    } catch (e) {
      console.warn('Failed to build MSA→Counties crosswalk:', e)
      return {} as Record<string, string[]>
    }
  }, [])

  const sdgOptions = React.useMemo(
    () => sortSdgKeys(Array.from(new Set(eung?.map(r => r.sdg) ?? []))),
    [eung]
  )
  const msaOptions = React.useMemo(
    () => Array.from(new Set(eung?.map(r => r.area_name) ?? [])).sort(),
    [eung]
  )
  const stateSdgOptions = React.useMemo(
    () => sortSdgKeys(Array.from(new Set(stateEung?.map(r => r.sdg) ?? []))),
    [stateEung]
  )

  // Initialize SDG/MSA when year changes
  React.useEffect(() => {
    if (eung?.[0]?.sdg) setActiveSdg(eung[0].sdg)
    if (eung?.[0]?.area_name) setActiveMsa(eung[0].area_name)
  }, [eung])
  React.useEffect(() => {
    if (stateEung?.[0]?.sdg) setActiveStateSdg(stateEung[0].sdg)
  }, [stateEung])

  // Build county-level metrics from MSA rows via crosswalk
  const metrics: MetricsByCounty = React.useMemo(() => {
    const out: MetricsByCounty = {}
    for (const { area_name, sdg, sdg_lq } of eung) {
      const msa = String(area_name).trim()
      const geoids = msaToCounties[msa] || []
      for (const gid of geoids) {
        ;(out[gid] ??= {})[sdg] = Number(sdg_lq)
      }
    }
    return out
  }, [eung, msaToCounties])
  const stateMetrics: MetricsByState = React.useMemo(() => {
    const out: MetricsByState = {}
    for (const { state_num, sdg, sdg_lq } of stateEung) {
      const stateId = String(state_num ?? '').padStart(2, '0')
      if (!stateId.trim()) continue
      ;(out[stateId] ??= {})[sdg] = Number(sdg_lq)
    }
    return out
  }, [stateEung])

  const activeCountySet = React.useMemo(() => {
    const msa = (activeMsa ?? '').trim()
    const ids = msaToCounties[msa] || []
    return new Set(ids)
  }, [msaToCounties, activeMsa])

  const employmentSeries = React.useMemo(() => {
    if (employmentFilterType !== 'occupation') return []
    return employmentRows
      .filter((row) => row.total_title === activeEmploymentOccupation)
      .sort((a, b) => a.year - b.year)
  }, [employmentFilterType, activeEmploymentOccupation])

  const employmentSelection = React.useMemo(
    () => (employmentFilterType === 'occupation' ? employmentSeries.at(-1) : null),
    [employmentFilterType, employmentSeries]
  )

  const employmentPreviewRows = React.useMemo(
    () => (employmentFilterType === 'occupation' ? employmentSeries.slice(-8).reverse() : []),
    [employmentFilterType, employmentSeries]
  )
  const employmentTrend = React.useMemo(
    () =>
      employmentSeries
        .map((row) => ({ year: row.year, value: row.tot_emp }))
        .filter((point) => Number.isFinite(point.value)),
    [employmentSeries]
  )
  const wageTrend = React.useMemo(
    () =>
      employmentSeries
        .map((row) => ({ year: row.year, value: row.annual_w }))
        .filter((point) => Number.isFinite(point.value)),
    [employmentSeries]
  )
  const employmentSummaryTitle = employmentSelection?.total_title ?? activeEmploymentOccupation ?? 'Occupation'
  const employmentSummaryContext = employmentSelection?.sdg ?? 'SDG N/A'
  const employmentSummaryYear = employmentSelection?.year
  const sdgOccupationSeries = React.useMemo(() => {
    if (employmentFilterType !== 'sdg') return []
    const grouped = new Map<string, EmploymentRow[]>()
    for (const row of employmentRows) {
      if (row.sdg !== activeEmploymentSdg) continue
      const arr = grouped.get(row.total_title) ?? []
      arr.push(row)
      grouped.set(row.total_title, arr)
    }
    return Array.from(grouped.entries())
      .map(([title, rows]) => ({ title, rows: rows.sort((a, b) => a.year - b.year) }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [employmentFilterType, activeEmploymentSdg])
  const sdgLatestRows = React.useMemo(() => {
    if (employmentFilterType !== 'sdg') return []
    return sdgOccupationSeries
      .map(({ title, rows }) => {
        const latest = rows.at(-1)
        return latest
          ? {
              title,
              sdg: latest.sdg,
              year: latest.year,
              tot_emp: latest.tot_emp,
              annual_w: latest.annual_w
            }
          : null
      })
      .filter((row): row is { title: string; sdg: string; year: number; tot_emp: number; annual_w: number } => Boolean(row))
      .sort((a, b) => Number(b.tot_emp ?? 0) - Number(a.tot_emp ?? 0))
  }, [employmentFilterType, sdgOccupationSeries])
  const formatNumber = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
    const abs = Math.abs(value)
    if (abs >= 1000) {
      const shortened = value / 1000
      const digits = abs >= 10000 ? 0 : 1
      const formatted = shortened.toFixed(digits).replace(/\.0+$/, '')
      return `${formatted}k`
    }
    return Math.round(value).toString()
  }
  const formatCurrency = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
    const abs = Math.abs(value)
    if (abs >= 1000) {
      const shortened = value / 1000
      const digits = abs >= 10000 ? 0 : 1
      const formatted = shortened.toFixed(digits).replace(/\.0+$/, '')
      return `$${formatted}k`
    }
    return `$${Math.round(value)}`
  }

  return (
    <div className="layout">
      <div className="header">
        <div className="brand">SDG Dashboard</div>
        <div className="tabs">
          {MAP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${activePage === tab.id ? 'active' : ''}`}
              onClick={() => setActivePage(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        {activePage === 'msa' && (
          <>
            <label>Year</label>
            <select value={activeYear} onChange={(e) => setActiveYear(Number(e.target.value))}>
              {MSA_AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <label>SDG</label>
            <select value={activeSdg} onChange={(e) => setActiveSdg(e.target.value)}>
              {sdgOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <label>Area</label>
            <select value={activeMsa ?? ''} onChange={(e) => setActiveMsa(e.target.value)}>
              {msaOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <div className="spacer" />

            <label>Labels</label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          </>
        )}

        {activePage === 'state' && (
          <>
            <label>Year</label>
            <select value={activeStateYear} onChange={(e) => setActiveStateYear(Number(e.target.value))}>
              {STATE_AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <label>SDG</label>
            <select value={activeStateSdg} onChange={(e) => setActiveStateSdg(e.target.value)}>
              {stateSdgOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="spacer" />
            <span>State-level overview</span>
          </>
        )}

        {activePage === 'employment' && (
          <>
            <div className="segmented">
              <button
                type="button"
                className={employmentFilterType === 'occupation' ? 'active' : ''}
                onClick={() => setEmploymentFilterType('occupation')}
              >
                By occupation
              </button>
              <button
                type="button"
                className={employmentFilterType === 'sdg' ? 'active' : ''}
                onClick={() => setEmploymentFilterType('sdg')}
              >
                By SDG
              </button>
            </div>

            {employmentFilterType === 'occupation' ? (
              <>
                <label>Occupation</label>
                <select value={activeEmploymentOccupation} onChange={(e) => setActiveEmploymentOccupation(e.target.value)}>
                  {EMPLOYMENT_OCCUPATIONS.map((title) => (
                    <option key={title} value={title}>{title}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label>SDG</label>
                <select value={activeEmploymentSdg} onChange={(e) => setActiveEmploymentSdg(e.target.value)}>
                  {EMPLOYMENT_SDGS.map((sdg) => (
                    <option key={sdg} value={sdg}>{sdg}</option>
                  ))}
                </select>
              </>
            )}

            <div className="spacer" />
            <span>Pick either occupation or SDG to explore trends</span>
          </>
        )}
      </div>

      <div className="content">
        {activePage === 'msa' ? (
          <div className="mapWrap">
            <SdgChoropleth
              dataKey="msa"
              geojson={countyGeojson}
              idProperty="GEOID"
              data={metrics}
              years={sdgOptions}
              initialYear={activeSdg}
              title={`${activeSdg} (SDG LQ, ${activeYear})`}
              valueFormatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v ?? ''))}
              center={[37.8, -96]}
              zoom={4}
              maxBounds={CONTIGUOUS_US_BOUNDS}
              maxBoundsViscosity={1}
              showBasemap={false}
              showCategoryControl={false}
              showResetButton={false}
            >
              {showLabels && (
                <CountyValueLabels
                  geojson={countyGeojson}
                  idProperty="GEOID"
                  metrics={metrics}
                  activeSdg={activeSdg}
                  activeMsaCounties={activeCountySet}
                />
              )}
            </SdgChoropleth>
          </div>
        ) : activePage === 'state' ? (
          <div className="mapWrap">
            <SdgChoropleth
              dataKey="state"
              geojson={stateGeojson}
              idProperty="STATE"
              data={stateMetrics}
              years={stateSdgOptions}
              initialYear={activeStateSdg}
              title={`${activeStateSdg} (State SDG LQ, ${activeStateYear})`}
              valueFormatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v ?? ''))}
              center={[37.8, -96]}
              zoom={4}
              maxBounds={CONTIGUOUS_US_BOUNDS}
              maxBoundsViscosity={1}
              showBasemap={false}
              showCategoryControl={false}
              showResetButton={false}
            />
          </div>
        ) : (
          <div className="employmentContent">
            {employmentFilterType === 'occupation' ? (
              <>
                <div className="panel">
                  <h3>Employment &amp; Wage Snapshot</h3>
                  {employmentSelection ? (
                    <>
                      <p>
                        <b>{employmentSummaryTitle}</b>
                        {employmentSummaryYear && (
                          <>
                            {' '}· Latest year: <b>{employmentSummaryYear}</b>
                          </>
                        )}
                        {' '}({employmentSummaryContext})
                      </p>
                      <div className="statsGrid">
                        <div className="statCard">
                          <span className="statLabel">Employment</span>
                          <span className="statValue">{formatNumber(employmentSelection.tot_emp)}</span>
                          <small>people employed</small>
                        </div>
                        <div className="statCard">
                          <span className="statLabel">Annual Wage</span>
                          <span className="statValue">{formatCurrency(employmentSelection.annual_w)}</span>
                          <small>average yearly pay</small>
                        </div>
                      </div>
                      <div className="chartsGrid chartsGrid--triple">
                        <TrendChart
                          data={employmentTrend}
                          title="Employment trend"
                          valueFormatter={formatNumber}
                          color="#2563eb"
                          yAxisLabel="Employment (people)"
                          yTickStep={1000}
                          xTickStep={5}
                          yTickFormatter={formatNumber}
                          statLabel="Latest employment"
                        />
                        <TrendChart
                          data={wageTrend}
                          title="Annual wage trend"
                          valueFormatter={formatCurrency}
                          color="#ea580c"
                          yAxisLabel="Annual Wage (USD)"
                          yTickStep={5000}
                          xTickStep={5}
                          yTickFormatter={formatCurrency}
                          statLabel="Latest wage"
                        />
                      </div>
                      <p className="muted">
                        Trends update automatically when you choose a different occupation. Track how hiring
                        and pay changed through time.
                      </p>
                    </>
                  ) : (
                    <p>No matching record exists for the chosen occupation.</p>
                  )}
                </div>

                <div className="panel">
                  <h3>Recent Records (Last {employmentPreviewRows.length})</h3>
                  {employmentPreviewRows.length ? (
                    <div className="tableWrap">
                      <table className="dataTable">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>Employment</th>
                            <th>Annual Wage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employmentPreviewRows.map((row) => (
                            <tr key={`${row.total_code}-${row.year}-${row.sdg}`}>
                              <td>{row.year}</td>
                              <td>{formatNumber(row.tot_emp)}</td>
                              <td>{formatCurrency(row.annual_w)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No preview data for the selected occupation.</p>
                  )}
                  <p className="muted">Recent observations help confirm whether trends align with SDG priorities.</p>
                </div>
              </>
            ) : (
              <>
                <div className="panel">
                  <h3>{activeEmploymentSdg} Occupation Overview</h3>
                  {sdgOccupationSeries.length ? (
                    <p>
                      Displaying <b>{sdgOccupationSeries.length}</b> occupations tracked under{' '}
                      <b>{activeEmploymentSdg}</b>. Each card highlights employment history with the latest wage
                      underneath.
                    </p>
                  ) : (
                    <p>No occupations were tagged with this SDG.</p>
                  )}
                </div>

                <div className="chartsGrid chartsGrid--triple">
                  {sdgOccupationSeries.map(({ title, rows }) => {
                    const latest = rows.at(-1)
                    return (
                      <TrendChart
                        key={title}
                        data={rows.map((row) => ({ year: row.year, value: row.tot_emp }))}
                        title={title}
                        valueFormatter={formatNumber}
                        color="#2563eb"
                        yAxisLabel="Employment (people)"
                        yTickStep={1000}
                        xTickStep={5}
                        yTickFormatter={formatNumber}
                        statLabel="Latest employment"
                        footer={
                          <div className="chartMeta">
                            <span>Latest year: {latest?.year ?? 'N/A'}</span>
                            <span>Wage: {formatCurrency(latest?.annual_w)}</span>
                          </div>
                        }
                      />
                    )
                  })}
                </div>

                <div className="panel">
                  <h3>{activeEmploymentSdg} Occupation Statistics</h3>
                  {sdgLatestRows.length ? (
                    <div className="tableWrap">
                      <table className="dataTable">
                        <thead>
                          <tr>
                            <th>Occupation</th>
                            <th>Year</th>
                            <th>Employment</th>
                            <th>Annual Wage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sdgLatestRows.map((row) => (
                            <tr key={`${row.title}-${row.year}`}>
                              <td>{row.title}</td>
                              <td>{row.year}</td>
                              <td>{formatNumber(row.tot_emp)}</td>
                              <td>{formatCurrency(row.annual_w)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No statistics available for this SDG.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type TrendPoint = { year: number; value: number }

function TrendChart({
  data,
  title,
  valueFormatter,
  color = '#2563eb',
  yAxisLabel = 'Value',
  xAxisLabel = 'Year',
  statLabel = 'Latest',
  footer,
  xTickStep = 5,
  yTickStep,
  xTickFormatter,
  yTickFormatter
}: {
  data: TrendPoint[]
  title: string
  valueFormatter?: (value: number) => string
  color?: string
  yAxisLabel?: string
  xAxisLabel?: string
  statLabel?: string
  footer?: React.ReactNode
  xTickStep?: number
  yTickStep?: number
  xTickFormatter?: (value: number) => string
  yTickFormatter?: (value: number) => string
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(360)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (Number.isFinite(width) && width > 0) {
        setContainerWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev))
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const sorted = React.useMemo(() => [...data].sort((a, b) => a.year - b.year), [data])
  if (!sorted.length) {
    return (
      <div className="chartCard" ref={containerRef}>
        <div className="chartHeader">
          <h4>{title}</h4>
        </div>
        <p className="muted">No data available.</p>
      </div>
    )
  }

  const width = Math.max(260, containerWidth - 20)
  const height = Math.max(130, Math.min(220, width * 0.45))
  const padding = 32
  const minValue = sorted.reduce((min, point) => Math.min(min, point.value), sorted[0].value)
  const maxValue = sorted.reduce((max, point) => Math.max(max, point.value), sorted[0].value)
  const valueRange = maxValue - minValue || 1
  const minYear = sorted[0].year
  const maxYear = sorted[sorted.length - 1].year
  const yearRange = maxYear - minYear || 1

  const computeResponsiveStep = (
    base: number | undefined,
    range: number,
    pixelSpan: number,
    minPixelGap: number
  ) => {
    if (!Number.isFinite(range) || range === 0) return 1
    const safeRange = Math.abs(range)
    let step =
      base ??
      Math.max(
        1,
        Math.round(safeRange / Math.max(2, Math.min(6, Math.floor(pixelSpan / minPixelGap))))
      )
    const approxTicks = safeRange / step
    if (approxTicks > 0) {
      const spacing = pixelSpan / approxTicks
      if (spacing < minPixelGap) {
        const factor = Math.ceil(minPixelGap / spacing)
        step *= factor
      }
    }
    return Math.max(1, Math.round(step))
  }

  const resolvedXStep = computeResponsiveStep(
    xTickStep,
    yearRange,
    Math.max(60, width - padding * 2),
    70
  )
  const resolvedYStep = computeResponsiveStep(
    yTickStep,
    valueRange,
    Math.max(50, height - padding * 2),
    45
  )

  const lastValue = sorted[sorted.length - 1]?.value
  const formattedLastValue =
    Number.isFinite(lastValue) && valueFormatter
      ? valueFormatter(lastValue as number)
      : Number.isFinite(lastValue)
      ? Math.round(lastValue as number).toLocaleString()
      : 'N/A'

  const coordinates = sorted.map((point) => {
    const xRatio = yearRange ? (point.year - minYear) / yearRange : 0
    const yRatio = valueRange ? (point.value - minValue) / valueRange : 0
    const x = padding + xRatio * (width - padding * 2)
    const y = height - padding - yRatio * (height - padding * 2)
    return { x, y }
  })

  const path = coordinates
    .map((coord, idx) => `${idx === 0 ? 'M' : 'L'} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
    .join(' ')

  const xTicks: number[] = []
  if (Number.isFinite(minYear) && Number.isFinite(maxYear)) {
    xTicks.push(minYear, maxYear)
    if (resolvedXStep && resolvedXStep > 0) {
      const start = Math.ceil(minYear / resolvedXStep) * resolvedXStep
      for (let tick = start; tick <= maxYear; tick += resolvedXStep) {
        if (tick !== minYear && tick !== maxYear) xTicks.push(tick)
      }
    }
    xTicks.sort((a, b) => a - b)
  }

  const yTicks: number[] = []
  if (Number.isFinite(minValue) && Number.isFinite(maxValue)) {
    const step = resolvedYStep || 1
    const start = Math.floor(minValue / step) * step
    const end = Math.ceil(maxValue / step) * step
    for (let tick = start; tick <= end; tick += step) {
      yTicks.push(tick)
    }
    if (!yTicks.includes(minValue)) yTicks.push(minValue)
    if (!yTicks.includes(maxValue)) yTicks.push(maxValue)
    yTicks.sort((a, b) => a - b)
  }

  const resolveYLabel = (value: number) => {
    if (yTickFormatter) return yTickFormatter(value)
    if (valueFormatter) return valueFormatter(value)
    return Math.round(value).toString()
  }
  const resolveXLabel = (value: number) => {
    if (xTickFormatter) return xTickFormatter(value)
    return String(value)
  }

  return (
    <div className="chartCard" ref={containerRef}>
      <div className="chartHeader">
        <h4>{title}</h4>
        <div className="chartStat">
          {statLabel && <span className="chartStatLabel">{statLabel}</span>}
          <span className="chartStatValue">{formattedLastValue}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title} over time`}
        className="trendChart"
      >
        <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map((coord, idx) => (
          <circle key={idx} cx={coord.x} cy={coord.y} r={4} fill={color} opacity={0.8} />
        ))}
        {yTicks.map((tick) => {
          const ratio = valueRange ? (tick - minValue) / valueRange : 0
          const y = height - padding - ratio * (height - padding * 2)
          return (
            <g key={`y-${tick}`}>
              <line
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
                opacity={0.4}
              />
              <line
                x1={padding - 6}
                x2={padding}
                y1={y}
                y2={y}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <text
                x={padding - 8}
                y={y + 3}
                textAnchor="end"
                className="axisTickLabel"
              >
                {resolveYLabel(tick)}
              </text>
            </g>
          )
        })}
        {xTicks.map((tick) => {
          const ratio = yearRange ? (tick - minYear) / yearRange : 0
          const x = padding + ratio * (width - padding * 2)
          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                x2={x}
                y1={height - padding}
                y2={height - padding + 6}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <text
                x={x}
                y={height - padding + 14}
                textAnchor="middle"
                className="axisTickLabel"
              >
                {resolveXLabel(tick)}
              </text>
            </g>
          )
        })}
        <text
          x={10}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 10 ${height / 2})`}
          className="axisLabelMajor"
        >
          {yAxisLabel}
        </text>
        <text x={width / 2} y={height - 2} textAnchor="middle" className="axisLabelMajor">
          {xAxisLabel}
        </text>
      </svg>
      {footer && <div className="chartFooter">{footer}</div>}
    </div>
  )
}
