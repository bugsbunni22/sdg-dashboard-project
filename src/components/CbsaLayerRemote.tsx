// src/components/CbsaLayerRemote.tsx
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type * as L from "leaflet";

// ✅ 로컬 폴리곤 파일 사용 (tigerweb 제거)
import cbsaGeo from "../data/cbsa_m1_4326.geojson";

const BINS = [40, 50, 75];
const PALETTE = ["#d73027", "#fee08b", "#a6d96a", "#1a9850"];
const UNAVAILABLE = "#ddd";

function colorFor(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return UNAVAILABLE;
  if (v < BINS[0]) return PALETTE[0];
  if (v <= BINS[1]) return PALETTE[1];
  if (v <= BINS[2]) return PALETTE[2];
  return PALETTE[3];
}

export default function CbsaLayerRemote({
  valueByCbsa,
  onPick,
}: {
  valueByCbsa: Map<string, number | null>;
  onPick?: (d: { geoid: string; name: string; value: number | null }) => void;
}) {
  // ✅ 로컬 데이터만 사용
  const fc = cbsaGeo as FeatureCollection;

  const style = (feat?: Feature<Geometry, any>): L.PathOptions => {
    const p = (feat?.properties ?? {}) as any;
    const geoid: string = String(p.GEOID ?? p.CBSA ?? "");
    const v = valueByCbsa.get(geoid) ?? null;
    return {
      fillColor: colorFor(v),
      fillOpacity: 0.85,
      color: "#fff",
      weight: 1.1,
    };
  };

  const onEach = (feat: Feature<Geometry, any>, layer: L.Layer) => {
    const ll = layer as L.Path & L.Layer;
    const p = (feat.properties ?? {}) as any;
    const geoid: string = String(p.GEOID ?? p.CBSA ?? "");
    const name: string = p.NAME ?? p.BASENAME ?? geoid;
    const v = valueByCbsa.get(geoid) ?? null;

    // 스타일 적용
    // @ts-ignore
    ll.setStyle?.(style(feat));

    // 인터랙션
    // @ts-ignore
    ll.on?.("mouseover", () => ll.setStyle?.({ weight: 2, fillOpacity: 1 }));
    // @ts-ignore
    ll.on?.("mouseout", () => ll.setStyle?.(style(feat)));
    // @ts-ignore
    ll.on?.("click", () => onPick?.({ geoid, name, value: v }));
    // @ts-ignore
    ll.bindTooltip?.(`${name}${v != null ? `: ${Math.round(v)}` : ""}`, { sticky: true });
  };

  return <GeoJSON data={fc} style={style} onEachFeature={onEach} />;
}
