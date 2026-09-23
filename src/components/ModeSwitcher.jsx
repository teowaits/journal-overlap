import { C } from "../constants.js";

/**
 * Top-level Overlap ⇄ Exclusive control — same tier as Set A/B inputs.
 */
export default function ModeSwitcher({ mode, onChange, disabled }) {
  const options = [
    { key: "overlap", label: "Overlap", hint: "Authors in both sets" },
    { key: "exclusive", label: "Exclusive", hint: "In A, not yet in B" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        Mode
      </div>
      <div
        role="group"
        aria-label="Analysis mode"
        style={{
          display: "inline-flex",
          border: `1px solid ${C.border2}`,
          borderRadius: 8,
          overflow: "hidden",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {options.map(({ key, label, hint }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              title={hint}
              onClick={() => { if (!disabled && mode !== key) onChange(key); }}
              style={{
                padding: "9px 18px",
                border: "none",
                borderRight: key === "overlap" ? `1px solid ${C.border2}` : "none",
                background: active ? C.surface2 : "transparent",
                color: active ? C.textPrimary : C.textMuted,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.04em",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
        {mode === "exclusive"
          ? "Find authors published in Set A who have not yet published in Set B (author scouting)."
          : "Find authors who have published in both Set A and Set B."}
      </div>
    </div>
  );
}
