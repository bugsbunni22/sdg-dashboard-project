// src/components/MsaPointLayer.tsx
import { CircleMarker, Tooltip } from "react-leaflet";
import type { MsaPoint } from "../hooks/useMsaPoints";

const BINS = [0.8, 1.0, 1.2];
const PALETTE = ["#d73027", "#fee08b", "#a6d96a", "#1a9850"];
const UNAVAILABLE = "#dddddd";
const isDev = import.meta.env.DEV;

function colorFor(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return UNAVAILABLE;
  if (v < BINS[0]) return PALETTE[0];
  if (v < BINS[1]) return PALETTE[1];
  if (v < BINS[2]) return PALETTE[2];
  return PALETTE[3];
}

export function MsaPointLayer({
  points,
  onSelect,
}: {
  points: MsaPoint[];
  onSelect?: (p: MsaPoint) => void;
}) {
  // 디버깅: 실제로 몇 개 렌더되는지
  if (isDev) {
    console.debug("[MsaPointLayer] points:", points?.length ?? 0);
  }

  if (!points || points.length === 0) return null;

  return (
    <>
      {points.map((p) => {
        const value = p.sdg_lq;
        const fill = colorFor(value);
        const key = `${p.area_name}-${p.sdg}-${p.lat.toFixed(4)}-${p.lng.toFixed(4)}`;

        return (
          <CircleMarker
            key={key}
            center={[p.lat, p.lng]}
            radius={7}
            pane="points" // 폴리곤 위로
            pathOptions={{
              color: "#222",
              weight: 1,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
            eventHandlers={{
              click: () => onSelect?.(p),
              mouseover: (e) => {
                const layer: any = e.target;
                layer.setStyle?.({ weight: 2, fillOpacity: 1.0 });
              },
              mouseout: (e) => {
                const layer: any = e.target;
                layer.setStyle?.({ weight: 1, fillOpacity: 0.95 });
              },
            }}
          >
            <Tooltip sticky>
              <div>
                <strong>{p.area_name}</strong>
                <br />
                {p.sdg}:{" "}
                {value == null || Number.isNaN(value) ? "N/A" : value.toFixed(2)}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
