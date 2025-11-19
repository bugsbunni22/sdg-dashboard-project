// src/components/SdgChoropleth.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";

type AnyRecord = Record<string | number, any>;
type FeatureLike = {
  type: string;
  properties?: AnyRecord;
  geometry?: any;
  __dataRecord?: AnyRecord; // Info 패널용 부착
};

type Props = {
  geojson: { features?: FeatureLike[] } | null;
  idProperty?: string;                        // 기본 "GEOID"
  data?: Record<string, AnyRecord>;           // { [GEOID]: { "SDG-01": number, ... } }
  years?: Array<string | number>;             // ["SDG-01", "SDG-02", ...]
  initialYear?: string | number;              // 초기 SDG
  title?: string;                             // Legend/Info 제목
  valueFormatter?: (v: any) => string | number;
  center?: L.LatLngExpression;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  tileUrl?: string;
  tileAttribution?: string;
  colorRamp?: string[];                       // light → dark (첫 칸은 no-data용 제외)
  children?: React.ReactNode;                 // Map 내부에서 렌더 (useMap 사용 가능)
  maxBounds?: L.LatLngBoundsExpression;
  maxBoundsViscosity?: number;
  showBasemap?: boolean;
  dataKey?: string;
  onFeatureClick?: (feature: FeatureLike, idValue?: string | number) => void;
  showCategoryControl?: boolean;
  showResetButton?: boolean;
};

// 기본 팔레트 (8단계: 1칸은 배경, 7칸을 구간 색으로 사용)
const DEFAULT_COLORS = [
  "#f7fbff", // unused or background-ish
  "#deebf7",
  "#c6dbef",
  "#9ecae1",
  "#6baed6",
  "#4292c6",
  "#2171b5",
  "#08519c",
];

function computeQuantileBreaks(values: number[], k = 7) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((i / k) * (v.length - 1));
    breaks.push(v[idx]);
  }
  return breaks; // 길이 k-1
}

function getClassIndex(breaks: number[], value?: number) {
  if (!Number.isFinite(value)) return -1;
  let i = 0;
  while (i < breaks.length && (value as number) > breaks[i]) i++;
  return i; // 0..breaks.length
}

function useChoropleth(
  geojson: { features?: FeatureLike[] } | null,
  data: Record<string, AnyRecord>,
  idProperty: string,
  year: string | number | undefined,
  colorRamp = DEFAULT_COLORS
) {
  return useMemo(() => {
    if (!geojson) return { styleFor: () => ({} as L.PathOptions), breaks: [] as number[] };

    const values: number[] = [];
    for (const f of geojson.features ?? []) {
      const id = f.properties?.[idProperty];
      const rec = id != null ? data?.[id] : undefined;
      const val = rec && year != null ? Number(rec[year]) : undefined;
      if (Number.isFinite(val)) values.push(val as number);
    }

    // colorRamp에서 첫 칸은 배경으로 두고 7분위(최대) 사용
    const classes = Math.min(colorRamp.length - 1, 7);
    const breaks = computeQuantileBreaks(values, classes);

    const styleFor = (feature: FeatureLike): L.PathOptions => {
      const id = feature.properties?.[idProperty];
      const rec = id != null ? data?.[id] : undefined;
      const val = rec && year != null ? Number(rec[year]) : undefined;
      const idx = getClassIndex(breaks, val);
      const has = Number.isFinite(val) && idx >= 0;
      const color = has ? colorRamp[idx + 1] : "#eee";
      return {
        weight: 0.8,
        opacity: 1,
        color: "#fff",
        dashArray: "",
        fillOpacity: has ? 0.85 : 0.5,
        fillColor: color,
      };
    };

    return { styleFor, breaks };
  }, [geojson, data, idProperty, year, colorRamp]);
}

function InfoControl({
  selected,
  hovered,
  idProperty,
  year,
  valueFormatter,
  title,
}: {
  selected: FeatureLike | null;
  hovered: FeatureLike | null;
  idProperty: string;
  year: string | number | undefined;
  valueFormatter?: (v: any) => string | number;
  title?: string;
}) {
  const map = useMap();
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Info = (L.Control as any).extend({
      onAdd() {
        const div = L.DomUtil.create(
          "div",
          "leaflet-bar p-3 rounded-xl shadow info-control bg-white/95 backdrop-blur"
        ) as HTMLDivElement;
        div.style.minWidth = "220px";
        div.style.maxWidth = "280px";
        div.style.lineHeight = "1.35";
        divRef.current = div;
        return div;
      },
      onRemove() {},
    });
    const ctrl = new Info({ position: "topright" });
    map.addControl(ctrl);
    return () => {
      map.removeControl(ctrl);
    };
  }, [map]);

  const region = selected ?? hovered;
  const name =
    (region?.properties?.name as string) ||
    (region?.properties?.NAME as string) ||
    (region?.properties?.County as string) ||
    "County";
  const id = region?.properties?.[idProperty];
  const rec = region?.__dataRecord;
  const val = rec && year != null ? rec[year] : undefined;

  useEffect(() => {
    if (!divRef.current) return;
    const fmt = (v: any) => (valueFormatter ? valueFormatter(v) : v);
    divRef.current.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">
          ${title ?? "Indicator"}
        </div>
        <div style="font-size:18px;font-weight:700;margin-top:2px;">
          ${region ? name : "Hover a county"}
        </div>
        <div style="font-size:13px;color:#334155;margin-top:6px;">
          ${region && id != null ? `<b>ID:</b> ${id}` : ""}
        </div>
        <div style="margin-top:8px;font-size:16px;">
          ${
            region && (val ?? null) !== null && val !== undefined
              ? `<b>Value:</b> ${fmt(val)}`
              : region
              ? "<em>No data</em>"
              : ""
          }
        </div>
      </div>
    `;
  }, [selected, hovered, idProperty, year, valueFormatter, title]);

  return null;
}

function Legend({
  breaks,
  colors = DEFAULT_COLORS,
  title = "Value",
}: {
  breaks: number[];
  colors?: string[];
  title?: string;
}) {
  const map = useMap();
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const LegendCtrl = (L.Control as any).extend({
      onAdd() {
        const div = L.DomUtil.create(
          "div",
          "leaflet-bar p-2 rounded-xl shadow bg-white/95 backdrop-blur legend-control"
        ) as HTMLDivElement;
        div.style.padding = "8px 10px";
        div.style.lineHeight = "1.2";
        divRef.current = div;
        return div;
      },
      onRemove() {},
    });
    const ctrl = new LegendCtrl({ position: "bottomright" });
    map.addControl(ctrl);
    return () => {
      map.removeControl(ctrl);
    };
  }, [map]);

  useEffect(() => {
    if (!divRef.current) return;

    if (!breaks.length) {
      divRef.current.innerHTML = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system;">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${title}</div>
          <div style="margin-top:6px;font-size:12px;color:#334155;">No data</div>
        </div>
      `;
      return;
    }

    const bins: string[] = ["<" + breaks[0].toFixed(2)];
    for (let i = 0; i < breaks.length - 1; i++) {
      bins.push(`${breaks[i].toFixed(2)}–${breaks[i + 1].toFixed(2)}`);
    }
    bins.push(">" + breaks[breaks.length - 1].toFixed(2));

    const swatches = bins
      .map((label, i) => {
        const color = colors[i + 1] ?? colors[colors.length - 1];
        return `
          <div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
            <span style="display:inline-block;width:16px;height:12px;background:${color};border:1px solid #e5e7eb"></span>
            <span style="font-size:12px;color:#334155;">${label}</span>
          </div>
        `;
      })
      .join("");

    divRef.current.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${title}</div>
        <div style="margin-top:6px;">${swatches}</div>
      </div>
    `;
  }, [breaks, colors, title]);

  return null;
}

function CategoryControl({
  years,
  year,
  onChange,
  label = "Category",
}: {
  years: Array<string | number> | undefined;
  year: string | number | undefined;
  onChange: (v: string | number) => void;
  label?: string;
}) {
  if (!years || years.length <= 1) return null;
  return (
    <div className="absolute left-3 bottom-3 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow p-2 flex items-center gap-2">
      <label className="text-xs tracking-wider uppercase text-slate-500">{label}</label>
      <select
        className="text-sm border rounded px-2 py-1 focus:outline-none"
        value={String(year ?? "")}
        onChange={(e) => onChange(e.target.value)} // 문자 키 지원
      >
        {years.map((y) => (
          <option key={String(y)} value={String(y)}>
            {String(y)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ResetViewButton({ center, zoom }: { center: L.LatLngExpression; zoom: number }) {
  const map = useMap();
  return (
    <button
      className="absolute left-3 top-3 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow px-3 py-2 text-sm hover:bg-white"
      onClick={() => map.setView(center, zoom)}
    >
      Reset view
    </button>
  );
}

export default function SdgChoropleth({
  geojson,
  idProperty = "GEOID",
  data = {},
  years = [],
  initialYear,
  title = "Indicator",
  valueFormatter,
  center = [37.8, -96],
  zoom = 4,
  minZoom = 3,
  maxZoom = 12,
  tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  colorRamp = DEFAULT_COLORS,
  children,
  maxBounds,
  maxBoundsViscosity = 1,
  showBasemap = true,
  dataKey,
  showCategoryControl = true,
  showResetButton = true,
  onFeatureClick,
}: Props) {
  // 내부 카테고리 상태 (문자/숫자 모두 허용)
  const defaultYear = useMemo(() => {
    if (initialYear != null) return initialYear;
    if (Array.isArray(years) && years.length) return years[years.length - 1];
    return undefined;
  }, [initialYear, years]);

  const [year, setYear] = useState<string | number | undefined>(defaultYear);
  useEffect(() => setYear(defaultYear), [defaultYear]);

  const { styleFor, breaks } = useChoropleth(geojson, data ?? {}, idProperty, year, colorRamp);

  const [hovered, setHovered] = useState<FeatureLike | null>(null);
  const [selected, setSelected] = useState<FeatureLike | null>(null);
  const dataLookup = useMemo(() => new Map(Object.entries(data ?? {})), [data]);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);

  const onEachFeature = (feature: FeatureLike, layer: L.Layer) => {
    const id = (feature as any)?.properties?.[idProperty];
    const rec = id != null ? dataLookup.get(String(id)) : undefined;
    if (rec) (feature as any).__dataRecord = rec;

    (layer as any).on({
      mouseover: (e: L.LeafletMouseEvent) => {
        const l = e.target as L.Path;
        l.setStyle({ weight: 2, color: "#111827", fillOpacity: 1 });
        if (!(L as any).Browser.ie && !(L as any).Browser.opera && !(L as any).Browser.edge) {
          (l as any).bringToFront();
        }
        setHovered(feature);
      },
      mouseout: (e: any) => {
        geojsonLayerRef.current?.resetStyle(e.target);
        setHovered((prev) => (prev === feature ? null : prev));
      },
      click: () => {
        setSelected((prev) => (prev === feature ? null : feature));
        onFeatureClick?.(feature, id);
      },
    });

    const name =
      feature.properties?.name ||
      feature.properties?.NAME ||
      feature.properties?.County ||
      "County";
    (layer as any).bindTooltip(name, { sticky: true, direction: "top", offset: L.point(0, -6) });
  };

  const style = (feature: FeatureLike) => {
    const base = styleFor(feature);
    if (selected && selected === feature) return { ...base, weight: 3, color: "#1f2937" };
    return base;
  };

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        maxBounds={maxBounds}
        maxBoundsViscosity={maxBounds ? maxBoundsViscosity : undefined}
        zoomControl={false}
        className="w-full h-full rounded-2xl shadow-lg"
      >
        {showBasemap && tileUrl && (
          <TileLayer attribution={tileAttribution} url={tileUrl} />
        )}

        {geojson && (
          <GeoJSON
            key={dataKey ?? idProperty}
            ref={geojsonLayerRef as any}
            data={geojson as any}
            style={style as any}
            onEachFeature={onEachFeature as any}
          />
        )}

        <ZoomControl position="topleft" />
        {showResetButton && <ResetViewButton center={center} zoom={zoom} />}

        {/* SDG 카테고리 선택 (문자 키) */}
        {showCategoryControl && (
          <CategoryControl years={years} year={year} onChange={setYear} label="Category" />
        )}

        {/* Info & Legend */}
        <InfoControl
          selected={selected}
          hovered={hovered}
          idProperty={idProperty}
          year={year}
          valueFormatter={valueFormatter}
          title={title}
        />
        <Legend breaks={breaks} title={title} />

        {/* Map ���� ���� (useMap ���� ��) */}
        {children}
      </MapContainer>
    </div>
  );
}
