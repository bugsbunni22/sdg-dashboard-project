// src/components/CbsaPolygonLayerLocal.tsx
import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import type * as L from "leaflet";
import { csv } from "d3-fetch";
// wellknown의 타입 선언이 없다면 src/types/wellknown.d.ts 추가(이미 안내했던 그대로)
// declare module "wellknown" { export function parse(wkt: string): any; export function stringify(g: any): string; }
import { parse as parseWKT } from "wellknown";

// Vite: URL 문자열로 가져오기
import msaCsvUrl from "../data/msa2025_centroids.csv?url";

type AnyRow = Record<string, any>;

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

function canon(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function CbsaPolygonLayerLocal({
  valueByCbsa,
  valueByName,
  onPick,
  valueColumn = "overall", // CSV에 값 컬럼명이 다르면 바꿔 쓰세요
}: {
  valueByCbsa: Map<string, number | null>;
  valueByName: Map<string, number | null>;
  onPick?: (d: { geoid: string; name: string; value: number | null }) => void;
  valueColumn?: string;
}) {
  const [fc, setFc] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    (async () => {
      const rows = (await csv(msaCsvUrl)) as AnyRow[];

      const features: Feature<Geometry, GeoJsonProperties>[] = [];
      for (const r of rows) {
        const wkt: string | undefined = r.wkt ?? r.WKT ?? r.geometry ?? r.GEOMETRY;
        if (!wkt) continue;

        const geom = parseWKT(wkt) as Geometry | null;
        if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;

        const geoid: string =
          String(r.cbsa_code ?? r.CBSA ?? r.GEOID ?? r.geoid ?? "").trim();
        const name: string =
          String(r.name ?? r.NAME ?? r.msa_name ?? r.area_name ?? geoid).trim();

        // 값 컬럼 찾기: 명시된 valueColumn, 없으면 sdg_lq/score/value/lq 순으로 시도
        const rawVal =
          r[valueColumn] ?? r.sdg_lq ?? r.score ?? r.value ?? r.lq ?? null;
        const value = rawVal != null && !Number.isNaN(Number(rawVal))
          ? Number(rawVal)
          : null;

        const feat: Feature<Geometry, GeoJsonProperties> = {
          type: "Feature", // ← 리터럴로 고정 (명시타이핑으로도 충분히 안전)
          geometry: geom,
          properties: {
            GEOID: geoid,
            NAME: name,
            value,
          },
        };
        features.push(feat);
      }

      const collection: FeatureCollection = {
        type: "FeatureCollection",
        features,
      };
      setFc(collection);
    })();
  }, [valueColumn]);

  if (!fc) return null;

  const style = (feat?: Feature<Geometry, GeoJsonProperties>): L.PathOptions => {
    const p = (feat?.properties ?? {}) as GeoJsonProperties & {
      GEOID?: string;
      NAME?: string;
      value?: number | null;
    };
    // 우선: 폴리곤에 이미 계산된 value가 있으면 사용
    let v: number | null | undefined = p.value ?? null;

    // 값이 없다면 외부 매핑으로 보강 (CBSA/GEOID → NAME 순)
    if (v == null) {
      const geoid = String(p.GEOID ?? "").trim();
      const nameKey = canon(String(p.NAME ?? ""));
      v =
        (geoid && valueByCbsa.has(geoid) ? valueByCbsa.get(geoid) : undefined) ??
        (nameKey ? valueByName.get(nameKey) ?? null : null);
    }

    return {
      fillColor: colorFor(v ?? null),
      fillOpacity: 0.9,
      color: "#fff",
      weight: 1.1,
    };
  };

  const onEach = (feat: Feature<Geometry, GeoJsonProperties>, layer: L.Layer) => {
    const ll = layer as L.Path & L.Layer;
    const p = (feat.properties ?? {}) as GeoJsonProperties & {
      GEOID?: string;
      NAME?: string;
      value?: number | null;
    };
    const geoid = String(p.GEOID ?? "").trim();
    const name = String(p.NAME ?? geoid);

    // 폴리곤 자체 값 또는 외부 매핑값
    let v: number | null | undefined = p.value ?? null;
    if (v == null) {
      const nameKey = canon(name);
      v =
        (geoid && valueByCbsa.has(geoid) ? valueByCbsa.get(geoid) : undefined) ??
        (nameKey ? valueByName.get(nameKey) ?? null : null);
    }

    // @ts-ignore
    ll.setStyle?.(style(feat));
    // @ts-ignore
    ll.on?.("mouseover", () => ll.setStyle?.({ weight: 2, fillOpacity: 1 }));
    // @ts-ignore
    ll.on?.("mouseout", () => ll.setStyle?.(style(feat)));
    // @ts-ignore
    ll.on?.("click", () => onPick?.({ geoid, name, value: v ?? null }));
    // @ts-ignore
    ll.bindTooltip?.(`${name}${v != null ? `: ${Math.round(v)}` : ""}`, {
      sticky: true,
    });
  };

  return <GeoJSON data={fc} style={style} onEachFeature={onEach} />;
}
