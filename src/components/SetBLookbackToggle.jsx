import { C } from "../constants.js";

/**
 * Set B lookback — Exclusive mode only.
 * sameWindow: match Set A's from-year window (cheaper).
 * allTime: any year OpenAlex has for Set B (stronger "new-to-portfolio" check).
 */
export default function SetBLookbackToggle({ lookback, onChange, disabled, fromYear }) {
  const options = [
    {
      key: "sameWindow",
      label: "Same window",
      hint: `Set B from ${fromYear}–present only`,
    },
    {
      key: "allTime",
      label: "All-time",
      hint: "Entire Set B history in OpenAlex",
    },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.textMuted, flexWrap: "wrap" }}>
      <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Set B lookback</span>
      <div
        role="group"
        aria-label="Set B lookback"
        style={{
          display: "inline-flex",
          border: `1px solid ${C.border2}`,
          borderRadius: 6,
          overflow: "hidden",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {options.map(({ key, label, hint }) => {
          const active = lookback === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              title={hint}
              onClick={() => { if (!disabled && lookback !== key) onChange(key); }}
              style={{
                padding: "5px 12px",
                border: "none",
                borderRight: key === "sameWindow" ? `1px solid ${C.border2}` : "none",
                background: active ? C.surface2 : "transparent",
                color: active ? C.textPrimary : C.textMuted,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
