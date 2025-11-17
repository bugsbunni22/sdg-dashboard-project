// src/ui.tsx
import type { ReactNode } from "react";

export function Header({
  active = "Interactive Map",
  onChange,
}: {
  active?: string;
  onChange?: (label: string) => void;
}) {
  const tabs = ["Key Messages", "Rankings", "Interactive Map", "State Profiles"];
  return (
    <div className="header">
      <div className="brand">United States Sustainable Development Report</div>
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t}
            className={`tab ${active === t ? "active" : ""}`}
            onClick={() => onChange?.(t)}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Toolbar({
  year,
  view,
  sdg,
  onYear,
  onView,
  onSDG,
  right,
}: {
  year: number;
  view: "Current" | "Trend";
  sdg: string;
  onYear: (y: number) => void;              // ✅ 오타 수정
  onView: (v: "Current" | "Trend") => void;
  onSDG: (s: string) => void;
  right?: ReactNode;
}) {
  // 우리가 갖고 있는 CSV가 SDG-01 형태라서 이렇게 맞춰줌
  const sdgOptions = [
    { value: "overall", label: "Overall" },
    ...Array.from({ length: 17 }, (_, i) => {
      const num = (i + 1).toString().padStart(2, "0"); // 01, 02 ...
      return {
        value: `SDG-${num}`,
        label: `SDG ${i + 1}`,
      };
    }),
  ];

  return (
    <div className="toolbar">
      <label>Indicator</label>

      <div>
        <select value={sdg} onChange={(e) => onSDG(e.target.value)}>
          {sdgOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <select value={view} onChange={(e) => onView(e.target.value as "Current" | "Trend")}>
          <option value="Current">Current</option>
          <option value="Trend">Trend</option>
        </select>
      </div>

      <div>
        <select value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {[2021, 2020, 2019].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="spacer" />
      {right}
    </div>
  );
}

export function Legend({
  bins = [40, 50, 75],
  palette = ["#d73027", "#fee08b", "#a6d96a", "#1a9850"],
  unavailable = "#ddd",
}: {
  bins?: number[];
  palette?: string[];
  unavailable?: string;
}) {
  // 라벨: <40, 40–50, 51–75, >75
  const labels = [
    `< ${bins[0]}`,
    `${bins[0]}–${bins[1]}`,
    `${bins[1] + 1}–${bins[2]}`,
    `> ${bins[2]}`,
  ];
  return (
    <div className="legend">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Legend</div>
      {labels.map((lab, i) => (
        <div className="row" key={lab}>
          <span className="swatch" style={{ background: palette[i] }} />
          <span>{lab}</span>
        </div>
      ))}
      <div className="row">
        <span className="swatch" style={{ background: unavailable }} />
        <span>Information unavailable</span>
      </div>
    </div>
  );
}
