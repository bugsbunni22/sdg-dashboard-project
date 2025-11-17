// src/hooks/useCbsaCentroids.ts
import { useEffect, useMemo, useState } from "react";
import { fetchCSV } from "../utils/csv";
import centroidsCsvUrl from "../data/msa2025_centroids.csv?url";

type Row = {
  GEOID?: string;
  CBSA?: string;
  NAME?: string;
  BASENAME?: string;
  LSADC?: string;
  lat?: string;
  lng?: string;
  // 필요하면 여기에 SDG 컬럼 추가(예: overall, SDG01 ...)
  overall?: string;
};

export type CbsaPoint = {
  geoid: string;
  name: string;
  lat: number;
  lng: number;
  value: number | null; // 색칠값(없으면 null)
};

const isDev = import.meta.env.DEV;

export function useCbsaCentroids() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = (await fetchCSV(centroidsCsvUrl)) as Row[];
        setRows(data);
        if (isDev) {
          console.debug("[CBSA centroids] rows:", data.length, "sample:", data[0]);
        }
      } catch (e) {
        console.error("centroids load error", e);
        setRows([]);
      }
    })();
  }, []);

  const points: CbsaPoint[] = useMemo(() => {
    return rows
      .map((r) => {
        const geoid = String(r.GEOID ?? r.CBSA ?? "").trim();
        const name = String(r.NAME ?? r.BASENAME ?? geoid).trim();
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        const value =
          r.overall != null && r.overall !== "" && !Number.isNaN(Number(r.overall))
            ? Number(r.overall)
            : null;
        if (!geoid || Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { geoid, name, lat, lng, value };
      })
      .filter(Boolean) as CbsaPoint[];
  }, [rows]);

  // 값이 필요 없으면 points만 쓰면 됨
  const valueByCbsa = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of points) m.set(p.geoid, p.value);
    return m;
  }, [points]);

  return { points, valueByCbsa };
}
