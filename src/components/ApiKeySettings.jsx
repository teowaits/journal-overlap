import { useState, useRef, useEffect } from "react";
import { C, ghostBtn } from "../constants.js";
import { getApiKey, setApiKey, clearApiKey, checkRemainingBudget } from "../api.js";

/**
 * Compact OpenAlex API key control — localStorage, same persistence model as gem_finder.
 */
export default function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // null | checking | valid | invalid
  const [remainingUsd, setRemainingUsd] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    const key = draft.trim();
    if (!key) {
      clearApiKey();
      setStatus(null);
      setRemainingUsd(null);
      return;
    }
    let cancelled = false;
    setStatus("checking");
    const timer = setTimeout(async () => {
      try {
        setApiKey(key);
        const b = await checkRemainingBudget(key);
        if (cancelled) return;
        setStatus("valid");
        setRemainingUsd(b.dailyRemainingUsd);
      } catch {
        if (!cancelled) {
          setStatus("invalid");
          setRemainingUsd(null);
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft]);

  const hasKey = !!draft.trim();
  const statusColor =
    status === "valid" ? C.greenDark :
    status === "invalid" ? C.red :
    C.textMuted;

  const statusLine = !hasKey
    ? "No key stored — OpenAlex free tier only. Paste a key for your personal daily budget."
    : status === "checking" ? "Checking key…"
    : status === "invalid" ? "Key looks invalid — check openalex.org/settings/api"
    : status === "valid" && remainingUsd != null
      ? `Key active — $${remainingUsd.toFixed(4)} remaining today`
      : status === "valid" ? "Key active"
      : "…";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...ghostBtn,
          padding: "4px 10px",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderColor: open ? C.blue + "66" : C.border2,
          color: open ? C.blueLight : C.textMuted,
        }}
        aria-expanded={open}
        aria-label="OpenAlex API key settings"
      >
        API key{hasKey && status === "valid" ? " · on" : ""}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="OpenAlex API key"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            padding: "14px",
            background: C.surface,
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
            zIndex: 500,
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 10 }}>
            Your OpenAlex API key
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              type={showKey ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your key…"
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1, minWidth: 0, padding: "7px 10px",
                background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 5,
                color: C.textPrimary, fontFamily: "inherit", fontSize: 11, outline: "none",
              }}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} style={{ ...ghostBtn, padding: "0 10px", fontSize: 10 }}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <a
            href="https://openalex.org/settings/api"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", fontSize: 11, color: C.blueLight, textDecoration: "none", marginBottom: 10 }}
          >
            Get a free key → openalex.org/settings/api
          </a>
          <div style={{ fontSize: 11, color: statusColor, lineHeight: 1.45, marginBottom: 10 }}>{statusLine}</div>
          <p style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.45, marginBottom: 12 }}>
            Stored in this browser (localStorage), sent only to OpenAlex. Survives tab close — use Forget when sharing a machine.
          </p>
          <button
            type="button"
            disabled={!hasKey}
            onClick={() => {
              clearApiKey();
              setDraft("");
              setShowKey(false);
              setStatus(null);
              setRemainingUsd(null);
            }}
            style={{
              ...ghostBtn,
              width: "100%",
              opacity: hasKey ? 1 : 0.4,
              cursor: hasKey ? "pointer" : "not-allowed",
              color: C.textSecondary,
            }}
          >
            Forget key
          </button>
        </div>
      )}
    </div>
  );
}
