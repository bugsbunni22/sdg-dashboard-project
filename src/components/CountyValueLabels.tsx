// src/components/CountyValueLabels.tsx
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

type MetricsByCounty = Record<string, Record<string, number>>

export default function CountyValueLabels({
  geojson,
  idProperty,
  metrics,
  activeSdg,
  activeMsaCounties,
}: {
  geojson: any
  idProperty: string
  metrics: MetricsByCounty
  activeSdg: string
  activeMsaCounties: Set<string>
}) {
  const map = useMap()
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.clearLayers()
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }
    const grp = L.layerGroup()

    for (const f of geojson?.features ?? []) {
      const id = f.properties?.[idProperty]
      if (!id) continue
      if (!activeMsaCounties.has(String(id))) continue
      const val = metrics?.[id]?.[activeSdg]
      if (val == null || Number.isNaN(val)) continue

      const geom = L.geoJSON(f as any)
      const center = geom.getBounds().getCenter()
      const html = `<div style="font-family: ui-sans-serif, system-ui; font-size:11px; font-weight:700; color:#111827; text-shadow:0 1px 2px rgba(255,255,255,.9)">${Number(val).toFixed(2)}</div>`
      const marker = L.marker(center, {
        icon: L.divIcon({ html, className: 'county-value-label', iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      })
      grp.addLayer(marker)
    }

    grp.addTo(map)
    layerRef.current = grp
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [geojson, idProperty, metrics, activeSdg, activeMsaCounties, map])

  return null
}
