// src/utils/crosswalk.ts
export type MsaToCounties = Record<string, string[]>;
type RawRow = Record<string, any>;

/** 2자리 주 + 3자리 카운티 → 5자리 GEOID */
function toGeoId(state: string | number, county: string | number) {
  const s = String(state ?? "").padStart(2, "0");
  const c = String(county ?? "").padStart(3, "0");
  return s + c;
}

/** 엑셀에서 온 행 배열 → { "Anchorage, AK": ["02020","02170"], ... } */
export function buildMsaToCountiesFromList(rows: RawRow[]): MsaToCounties {
  const map: MsaToCounties = {};
  for (const row of rows || []) {
    // 파일 컬럼명 (엑셀 헤더가 깨졌을 때 대비해 후보 넓게 잡음)
    const title =
      row["CBSA Title"] ??
      row["Metropolitan/Micropolitan Statistical Area"] ??
      row["Title"] ??
      row["Unnamed: 3"];
    const stateFips = row["FIPS State Code"] ?? row["State FIPS"] ?? row["Unnamed: 9"];
    const countyFips = row["FIPS County Code"] ?? row["County FIPS"] ?? row["Unnamed: 10"];

    if (!title || stateFips == null || countyFips == null) continue;

    const msa = String(title).trim();
    const geoid = toGeoId(stateFips, countyFips);
    (map[msa] ??= []).push(geoid);
  }
  // 중복 제거 + 정렬
  for (const k of Object.keys(map)) {
    map[k] = Array.from(new Set(map[k])).sort();
  }
  return map;
}
