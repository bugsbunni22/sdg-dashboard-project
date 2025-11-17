import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import type * as L from "leaflet";
import { parse as parseWKT } from "wellknown"; // WKT → GeoJSON
import { fetchCSV } from "../utils/csv";

// ✅ 너가 가진 파일 경로 그대로
import csvUrl from "../data/msa2025_centroids.csv?url";

type AnyRow = Record<string, string>;

const BINS = [40, 50, 75];
const PALETTE = ["#d73027", "#fee08b", "#a6d96a", "#1a9850"];
const UNAVAILABLE = "#ddd";
const isDev = import.meta.env.DEV;

function colorFor(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return UNAVAILABLE;
  if (v < BINS[0]) return PALETTE[0];
  if (v <= BINS[1]) return PALETTE[1];
  if (v <= BINS[2]) return PALETTE[2];
  return PALETTE[3];
}

// 소문자/대문자 섞여도 안전하게 값 뽑기
function pick(row: AnyRow, keys: string[]) {
  for (const k of keys) {
    if (row[k] != null) return row[k];
    const lower = Object.keys(row).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (lower) return row[lower];
  }
  return "";
}

// CSV 행 하나 → GeoJSON Feature (Polygon/MultiPolygon)
// geometry는 아래 우선순위로 파싱: geojson/geometry → wkt → rings/coordinates
function rowToFeature(row: AnyRow): Feature<Polygon | MultiPolygon> | null {
  const id = pick(row, ["GEOID", "CBSA", "geoid", "cbsa"]).trim();
  const name = pick(row, ["NAME", "BASENAME", "name", "basename"]) || id;

  // 1) GeoJSON 문자열
  const geojsonStr = pick(row, ["geojson", "geometry"]);
  if (geojsonStr) {
    try {
      const g = JSON.parse(geojsonStr);
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        return {
          type: "Feature",
          geometry: g,
          properties: { GEOID: id, NAME: name, ...row },
        } as Feature<Polygon | MultiPolygon>;
      }
      // Feature 형태일 수도 있음
      if (g && g.type === "Feature" && g.geometry) {
        const gg = g.geometry;
        if (gg.type === "Polygon" || gg.type === "MultiPolygon") {
          return {
            type: "Feature",
            geometry: gg,
            properties: { GEOID: id, NAME: name, ...row, ...(g.properties || {}) },
          } as Feature<Polygon | MultiPolygon>;
        }
      }
    } catch {}
  }

  // 2) WKT
  const wktStr = pick(row, ["wkt", "WKT"]);
  if (wktStr) {
    try {
      const g = parseWKT(wktStr) as Geometry;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        return {
          type: "Feature",
          geometry: g as Polygon | MultiPolygon,
          properties: { GEOID: id, NAME: name, ...row },
        };
      }
    } catch {}
  }

  // 3) rings/coordinates (JSON 문자열)
  const ringStr = pick(row, ["rings", "coordinates"]);
  if (ringStr) {
    try {
      const coords = JSON.parse(ringStr);
      // MULTIPOLYGON이면 [[[[]]]], POLYGON이면 [[[]]]
      const isMulti = Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && Array.isArray(coords[0][0][0]);
      const geom: Polygon | MultiPolygon = isMulti
        ? { type: "MultiPolygon", coordinates: coords }
        : { type: "Polygon", coordinates: coords };
      return {
        type: "Feature",
        geometry: geom,
        properties: { GEOID: id, NAME: name, ...row },
      };
    } catch {}
  }

  return null;
}

export default function CbsaPolygonFromCsv({
  valueColumn = "overall", // 색칠에 사용할 값 컬럼명 (없으면 회색)
  onPick,
}: {
  valueColumn?: string;
  onPick?: (d: { geoid: string; name: string; value: number | null }) => void;
}) {
  const [fc, setFc] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = (await fetchCSV(csvUrl)) as AnyRow[];
        const feats: Feature<Polygon | MultiPolygon>[] = [];
        for (const r of rows) {
          const f = rowToFeature(r);
          if (f) feats.push(f);
        }
        setFc({ type: "FeatureCollection", features: feats });
        if (isDev) {
          console.debug("[CBSA polygons from CSV] features:", feats.length);
        }
      } catch (e) {
        console.error("CSV → polygons load error:", e);
        setFc(null);
      }
    })();
  }, []);

  if (!fc) return null;

  const style = (feat?: Feature<Geometry, any>): L.PathOptions => {
    const props = (feat?.properties ?? {}) as AnyRow;
    const raw = pick(props, [valueColumn]);
    const v = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
    return {
      fillColor: colorFor(v),
      fillOpacity: 0.9,
      color: "#fff",
      weight: 1.1,
    };
  };

  const onEach = (feat: Feature<Geometry, any>, layer: L.Layer) => {
    const ll = layer as L.Path & L.Layer;
    const p = (feat.properties ?? {}) as AnyRow;
    const geoid = pick(p, ["GEOID", "CBSA", "geoid", "cbsa"]).trim();
    const name = pick(p, ["NAME", "BASENAME", "name", "basename"]) || geoid;
    const raw = pick(p, [valueColumn]);
    const v = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;

    // @ts-ignore
    ll.setStyle?.(style(feat));
    // @ts-ignore
    ll.on?.("mouseover", () => ll.setStyle?.({ weight: 2, fillOpacity: 1 }));
    // @ts-ignore
    ll.on?.("mouseout", () => ll.setStyle?.(style(feat)));
    // @ts-ignore
    ll.on?.("click", () => onPick?.({ geoid, name, value: v }));
    // @ts-ignore
    ll.bindTooltip?.(
      `${name}${v != null ? `: ${Math.round(v)}` : ""}`,
      { sticky: true }
    );
  };

  return <GeoJSON data={fc} style={style} onEachFeature={onEach} />;
}
