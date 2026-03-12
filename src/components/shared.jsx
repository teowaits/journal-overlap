import { C, ghostBtn } from "../constants.js";

export function Spinner({ size = 18, color = C.blue }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${color}33`, borderTopColor: color, animation: "spin 0.7s linear infinite", flexShrink: 0 }} />;
}

export function ProgressBar({ value, max, color }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: C.border2, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.3s ease" }} />
    </div>
  );
}

export function ExportButton({ onClick, label = "Export CSV" }) {
  return (
    <button onClick={onClick} style={{ ...ghostBtn, padding: "5px 14px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {label}
    </button>
  );
}
