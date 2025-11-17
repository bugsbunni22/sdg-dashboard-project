// src/App.tsx
import React from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import SdgChoropleth from './components/SdgChoropleth'
import CountyValueLabels from './components/CountyValueLabels'
import countiesGeojsonRaw from './data/counties_500k.json'
import statesGeojsonRaw from './data/usa_state_20m.json'
import msaToCountiesRows from './data/msaTOcounties.json'
import { buildMsaToCountiesFromList } from './utils/crosswalk'

type Row = { area_name: string; sdg: string; sdg_lq: number }
type EungMsa = Row[]
type MetricsByCounty = Record<string, Record<string, number>>
type StateRow = { state_num: number; state_name: string; sdg: string; sdg_lq: number }
type StateEung = StateRow[]
type MetricsByState = Record<string, Record<string, number>>
type MapPage = 'msa' | 'state'

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
const MAP_TABS: { id: MapPage; label: string }[] = [
  { id: 'msa', label: 'MSA Map' },
  { id: 'state', label: 'State Map' }
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
        {activePage === 'msa' ? (
          <>
            <label>Year</label>
            <select value={activeYear} onChange={(e) => setActiveYear(Number(e.target.value))}>
              {MSA_AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <label>SDG</label>
            <select value={activeSdg} onChange={(e) => setActiveSdg(e.target.value)}>
              {sdgOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label>Area</label>
            <select value={activeMsa ?? ''} onChange={(e) => setActiveMsa(e.target.value)}>
              {msaOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <div className="spacer" />

            <label>Labels</label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          </>
        ) : (
          <>
            <label>Year</label>
            <select value={activeStateYear} onChange={(e) => setActiveStateYear(Number(e.target.value))}>
              {STATE_AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <label>SDG</label>
            <select value={activeStateSdg} onChange={(e) => setActiveStateSdg(e.target.value)}>
              {stateSdgOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="spacer" />
            <span>State-level overview</span>
          </>
        )}
      </div>

      <div className="content">
        {activePage === 'msa' ? (
          <>
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

            <aside className="panel">
              <h3>MSA Details</h3>
              <p>Selected Year: <b>{activeYear}</b></p>
              <p>Selected SDG: <b>{activeSdg}</b></p>
              <p>Selected Area (MSA): <b>{activeMsa ?? '-'}</b></p>
              <p>This side panel can show MSA-level metric descriptions.</p>
            </aside>
          </>
        ) : (
          <>
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
              />
            </div>

            <aside className="panel">
              <h3>State Details</h3>
              <p>Selected Year: <b>{activeStateYear}</b></p>
              <p>Selected SDG: <b>{activeStateSdg}</b></p>
              <p>Each state displays its SDG location quotient for the chosen category.</p>
              <p>Use the toolbar to change categories or years.</p>
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
