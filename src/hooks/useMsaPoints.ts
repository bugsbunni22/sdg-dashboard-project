import { useEffect, useMemo, useState } from "react";
import { fetchCSV } from "../utils/csv";

import msaCsvUrl from "../data/eung_msa/eung_msa_2010.csv?url";
import metrosCsvUrl from "../data/usmetros.csv?url";

type AnyRow = Record<string, string>;

export type MsaPoint = {
  area_name: string;
  sdg: string;
  sdg_lq: number;
  lat: number;
  lng: number;
};

/* ------------------------- 유틸 ------------------------- */
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
function pick(row: AnyRow, candidates: string[]) {
  for (const k of candidates) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

// "SDG-01" / "sdg1" / "SDG 1" / "1" / "overall" → 통일
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

/* ------------------------- 주 약어 통일 ------------------------- */
const STATE_ABBR: Record<string, string> = {
  "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
  "california": "ca", "colorado": "co", "connecticut": "ct", "delaware": "de",
  "florida": "fl", "georgia": "ga", "hawaii": "hi", "idaho": "id",
  "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
  "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md",
  "massachusetts": "ma", "michigan": "mi", "minnesota": "mn", "mississippi": "ms",
  "missouri": "mo", "montana": "mt", "nebraska": "ne", "nevada": "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", "ohio": "oh", "oklahoma": "ok",
  "oregon": "or", "pennsylvania": "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut",
  "vermont": "vt", "virginia": "va", "washington": "wa", "west virginia": "wv",
  "wisconsin": "wi", "wyoming": "wy",
  "district of columbia": "dc", "washington dc": "dc"
};

function normStateToken(raw: string) {
  const t = canon(unquote(raw));
  if (!t) return "";
  // 앞 2자 약어로 보이면 그 자체 사용 (예: "AK", "ak", "ak ")
  const m2 = t.match(/^[a-z]{2}/);
  if (m2) return m2[0];
  // 풀네임 매핑
  if (STATE_ABBR[t]) return STATE_ABBR[t];
  const maybe = STATE_ABBR[t.replace(/\s+/g, " ")];
  if (maybe) return maybe;
  return "";
}

/** "Anchorage, AK" → { city:"anchorage", state:"ak" } (state 없으면 "") */
function normalizeAreaName(raw: string) {
  const norm = canon(unquote(raw));
  if (!norm) return { city: "", state: "" };
  const parts = norm.split(",");
  const city = canon(parts[0] ?? "");
  const state = normStateToken(parts[1] ?? "");
  return { city, state };
}

/** SimpleMaps "Anchorage, AK Metro Area" → { city:"anchorage", state:"ak" } */
function normalizeMetroName(metro: string | undefined, stateId: string | undefined) {
  const stripped = (metro ?? "").replace(
    /\s*(metropolitan statistical area|metropolitan area|metro area|metro)\s*$/i,
    ""
  );
  const norm = canon(unquote(stripped));
  const parts = norm.split(",");
  const city = canon(parts[0] ?? "");
  const stateFromName = normStateToken(parts[1] ?? "");
  const state = normStateToken(stateFromName || stateId || "");
  return { city, state };
}
/* ------------------------------------------------------ */

export function useMsaPoints(selectedSDG: string) {
  const [msaRows, setMsaRows] = useState<AnyRow[] | null>(null);
  const [metroRows, setMetroRows] = useState<AnyRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // CSV 로드
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [msa, metros] = await Promise.all([fetchCSV(msaCsvUrl), fetchCSV(metrosCsvUrl)]);
        console.debug("[LOAD] MSA rows:", msa.length, "sample:", msa[0]);
        console.debug("[LOAD] METRO rows:", metros.length, "sample:", metros[0]);
        setMsaRows(msa);
        setMetroRows(metros);
      } catch (e) {
        console.error("CSV load error", e);
        setMsaRows([]);
        setMetroRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 정규화 + 조인
  const points: MsaPoint[] = useMemo(() => {
    if (!msaRows || !metroRows) return [];

    /* 1) 메트로(좌표) 테이블 정규화/인덱싱 */
    type MetroNorm = { city: string; state: string; lat: number; lng: number; raw: AnyRow };
    const metroByKey = new Map<string, MetroNorm>();   // "city|state"
    const cityIndex = new Map<string, MetroNorm[]>();  // "city" → 후보들

    metroRows.forEach((row) => {
      // 다양한 키 후보를 지원
      const metroName = pick(row, ["metro", "name", "metro_name", "cbsa_title", "cbsa"]);
      const stId = pick(row, ["state_id", "state", "st", "state_code"]);
      const latStr = pick(row, ["lat", "latitude", "y"]);
      const lngStr = pick(row, ["lng", "lon", "long", "longitude", "x"]);

      const { city, state } = normalizeMetroName(metroName, stId);
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!city || Number.isNaN(lat) || Number.isNaN(lng)) return;

      const norm: MetroNorm = { city, state, lat, lng, raw: row };
      const key = `${city}|${state}`;
      metroByKey.set(key, norm);

      const arr = cityIndex.get(city) ?? [];
      arr.push(norm);
      cityIndex.set(city, arr);
    });

    console.debug("[INDEX] metro keys:", metroByKey.size, "example key:", [...metroByKey.keys()][0]);

    /* 2) MSA 테이블 정규화 */
    type MsaNorm = { area_name: string; sdg: string; sdg_lq: number; city: string; state: string };
    const msaNorm: MsaNorm[] = [];
    msaRows.forEach((row) => {
      const areaName = pick(row, ["area_name", "msa", "name", "area", "area_name_2010", "area2010"]);
      const sdgRaw = pick(row, ["sdg", "indicator", "sdg_code"]);
      const lqRaw = pick(row, ["sdg_lq", "value", "score", "lq", "sdg_lq_2010"]);

      const sdg = normalizeSdg(sdgRaw);
      const { city, state } = normalizeAreaName(areaName);
      const lq = Number(lqRaw);

      if (!city) return; // 최소 조건: 도시명

      msaNorm.push({
        area_name: unquote(areaName),
        sdg,
        sdg_lq: Number.isFinite(lq) ? lq : NaN,
        city,
        state,
      });
    });

    console.debug("[NORM] MSA rows:", msaNorm.length, "sample:", msaNorm[0]);

    /* 3) SDG 필터 */
    const wanted = normalizeSdg(selectedSDG);
    const filtered = wanted === "overall" ? msaNorm : msaNorm.filter((r) => r.sdg === wanted);

    console.debug("[FILTER] wanted:", wanted, "rows:", filtered.length);

    /* 4) 조인 (정확키 → 도시-only 단일/동일주 보조) */
    const pts: MsaPoint[] = [];
    const notMatched: string[] = [];
    let fallbackSingleHit = 0;

    filtered.forEach((r) => {
      let metro = metroByKey.get(`${r.city}|${r.state}`);

      if (!metro && !r.state) {
        const cands = cityIndex.get(r.city) ?? [];
        if (cands.length === 1) {
          metro = cands[0];
          fallbackSingleHit++;
        } else if (cands.length > 1) {
          const uniqStates = Array.from(new Set(cands.map((c) => c.state)));
          if (uniqStates.length === 1) {
            metro = cands[0];
            fallbackSingleHit++;
          }
        }
      }

      if (!metro) {
        notMatched.push(`"${r.city}${r.state ? ", " + r.state : ""}" ← "${r.area_name}"`);
        return;
      }

      if (!Number.isFinite(r.sdg_lq)) return;

      pts.push({
        area_name: r.area_name,
        sdg: r.sdg,
        sdg_lq: r.sdg_lq,
        lat: metro.lat,
        lng: metro.lng,
      });
    });

    console.debug("[RESULT] matched points:", pts.length, `(fallback: ${fallbackSingleHit})`);
    if (notMatched.length) {
      console.warn("[RESULT] not matched (up to 10):", notMatched.slice(0, 10));
    }

    return pts;
  }, [msaRows, metroRows, selectedSDG]);

  return { points, loading };
}
