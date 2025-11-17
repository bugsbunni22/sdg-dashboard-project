// src/hooks/useMsaValues.ts
import { useEffect, useMemo, useState } from "react";
import { fetchCSV } from "../utils/csv";

const ALL_CSV = import.meta.glob<string>("../data/eung_msa/eung_msa_*.csv?url", {
  import: "default",
});
const isDev = import.meta.env.DEV;
type AnyRow = Record<string, string>;

export type UseMsaValuesResult = {
  loading: boolean;
  error: string | null;
  valueByCbsa: Map<string, number | null>; // key: CBSA/GEOID (문자열)
  valueByName: Map<string, number | null>; // key: 정규화된 NAME/BASENAME
  rows: AnyRow[];
  meta: { year: number; sdg: string; matched: number; total: number };
};

// 파일들(2000~2024)을 한 번에 등록해두고, 연도에 따라 골라 씁니다.
// Vite 전용: as: 'url' 로 모듈이 URL 문자열을 반환.
// ✅ import 제거
// import msaCsvUrl from "../data/msa2025_centroids.csv";

function unquote(s: string) {
  return (s ?? "").trim().replace(/^["']+|["']+$/g, "");
}
function canon(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}
// "Anchorage, AK" → "anchorage, ak"
function canonAreaName(s: string) {
  return canon(unquote(s));
}
// sdg 입력 정규화: "overall", "1", "SDG1", "SDG-01" → "overall" 또는 "SDG-01"
function normalizeSdg(raw: string) {
  const s = canon(unquote(raw));
  if (!s || s === "overall" || s === "all" || s === "total") return "overall";
  const mNumOnly = s.match(/^(\d{1,2})$/);
  if (mNumOnly) return `SDG-${mNumOnly[1].padStart(2, "0")}`;
  const m = s.match(/^sdg[-\s]?(\d{1,2})$/);
  if (m) return `SDG-${m[1].padStart(2, "0")}`;
  if (/^sdg-\d{2}$/.test(s)) return s.toUpperCase();
  return s.toUpperCase();
}

function pick(row: AnyRow, keys: string[]) {
  for (const k of keys) {
    if (row[k] != null) return row[k];
    const lower = Object.keys(row).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (lower) return row[lower];
  }
  return "";
}

// 지정 연도 CSV의 URL 가져오기
async function urlForYear(year: number): Promise<string | null> {
  const re = new RegExp(`eung_msa_${year}\\.csv$`, "i");
  const matchKey = Object.keys(ALL_CSV).find((k) => re.test(k));
  if (!matchKey) return null;
  const loader = ALL_CSV[matchKey] as unknown as () => Promise<string>;
  const url = await loader();
  return url;
}

/**
 * 선택한 연도와 SDG에 맞춰 값 맵(Map)을 만든다.
 * - valueByCbsa: key = CBSA/GEOID 문자열
 * - valueByName: key = 정규화된 NAME/BASENAME("anchorage, ak")  → 폴리곤 NAME 매칭용
 *
 * CSV 스키마 가정:
 * - area_name: "Anchorage, AK" (필수)
 * - sdg: "SDG-01" / "overall" 등 (필수)
 * - sdg_lq: 숫자 문자열 (필수)
 * - [선택] CBSA/GEOID 컬럼이 있으면 더 정확히 매칭
 *
 * sdg === "overall" 이면서 해당 레코드가 없으면, 동일 area_name의 모든 sdg_lq 평균으로 대체.
 */
export function useMsaValues(sdgInput: string, year: number): UseMsaValuesResult {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 연도 바뀔 때 CSV 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = await urlForYear(year);
        if (!url) throw new Error(`CSV not found for year ${year}`);
        const data = (await fetchCSV(url)) as AnyRow[];
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const wanted = normalizeSdg(sdgInput);

  // 값 맵 계산
  const { valueByCbsa, valueByName, matched, total } = useMemo(() => {
    const byCbsa = new Map<string, number | null>();
    const byName = new Map<string, number | null>();

    if (!rows.length) return { valueByCbsa: byCbsa, valueByName: byName, matched: 0, total: 0 };

    // 우선 전체를 area_name 기준으로 그룹핑
    const groupByArea = new Map<string, AnyRow[]>();
    for (const r of rows) {
      const area = canonAreaName(pick(r, ["area_name", "area", "msa", "name"]));
      if (!area) continue;
      const arr = groupByArea.get(area) ?? [];
      arr.push(r);
      groupByArea.set(area, arr);
    }

    // area별 원하는 값 계산
    let localMatched = 0;
    const totalAreas = groupByArea.size;

    for (const [areaKey, recs] of groupByArea.entries()) {
      // SDG 필터
      let recsForWanted: AnyRow[] = [];
      if (wanted === "overall") {
        // 1) sdg가 overall 인 레코드 우선
        recsForWanted = recs.filter((r) => normalizeSdg(pick(r, ["sdg", "indicator"])) === "overall");
        if (recsForWanted.length === 0) {
          // 2) 없으면 모든 sdg_lq 평균값 사용
          const nums = recs
            .map((r) => Number(pick(r, ["sdg_lq", "value", "score", "lq"])))
            .filter((v) => Number.isFinite(v));
          const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
          const v = Number.isFinite(mean) ? mean : null;
          byName.set(areaKey, v);
          // CBSA 키가 있으면 같이 설정
          const cbsa = (pick(recs[0], ["CBSA", "GEOID"]) || "").trim();
          if (cbsa) byCbsa.set(cbsa, v);
          localMatched++;
          continue;
        }
      } else {
        recsForWanted = recs.filter((r) => normalizeSdg(pick(r, ["sdg", "indicator"])) === wanted);
      }

      // 선택된 SDG의 평균(보통 한 행이겠지만 평균으로 안전하게)
      const nums = recsForWanted
        .map((r) => Number(pick(r, ["sdg_lq", "value", "score", "lq"])))
        .filter((v) => Number.isFinite(v));
      const val = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

      byName.set(areaKey, val);
      const cbsa = (pick(recsForWanted[0] ?? recs[0], ["CBSA", "GEOID"]) || "").trim();
      if (cbsa) byCbsa.set(cbsa, val);
      localMatched++;
    }

    if (isDev) {
      console.debug(
        `[MSA values] year=${year}, sdg=${wanted}, areas=${totalAreas}, withCodes=${byCbsa.size}`
      );
    }

    return { valueByCbsa: byCbsa, valueByName: byName, matched: localMatched, total: totalAreas };
  }, [rows, year, wanted]);

  return { loading, error, valueByCbsa, valueByName, rows, meta: { year, sdg: wanted, matched, total } };
}
