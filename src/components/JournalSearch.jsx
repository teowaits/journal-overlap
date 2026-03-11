import { useState, useRef } from "react";
import { C, ghostBtn } from "../constants.js";
import { parsePastedNames } from "../utils.js";
import { searchSources, resolveJournalNames } from "../api.js";
import { Spinner } from "./shared.jsx";

function JournalPill({ journal, onRemove, color }) {
  const accent = color === "A" ? C.blue : C.amber;
  const bg = color === "A" ? "rgba(99,179,237,0.12)" : "rgba(246,173,85,0.12)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: bg, border: `1px solid ${accent}44`, borderRadius: 6, padding: "4px 10px", fontSize: 12, color: color === "A" ? C.blueLight : C.amberLight }}>
      <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{journal.display_name}</span>
      {journal.works_count != null && <span style={{ opacity: 0.4, fontSize: 11 }}>~{journal.works_count.toLocaleString()}</span>}
      <button onClick={() => onRemove(journal.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.55, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

function PasteModal({ color, existing, onAdd, onClose }) {
  const accent = color === "A" ? C.blue : C.amber;
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle");
  const [resolved, setResolved] = useState([]);
  const [failed, setFailed] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const resolve = async () => {
    const names = parsePastedNames(text);
    if (!names.length) return;
    setStatus("resolving");
    const { resolved: r, failed: f } = await resolveJournalNames(names);
    const fresh = r.filter(j => !existing.find(e => e.id === j.id));
    setResolved(fresh); setFailed(f); setSelected(new Set(fresh.map(j => j.id)));
    setStatus("done");
  };
  const confirm = () => { onAdd(resolved.filter(j => selected.has(j.id))); onClose(); };
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.surface, border: `1px solid ${accent}33`, borderRadius: 12, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.6)", animation: "fadeIn 0.2s ease" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 4, letterSpacing: "0.08em" }}>PASTE JOURNAL LIST — SET {color}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 16 }}>One per line, or separated by commas / semicolons.</div>
        {status === "idle" && (
          <>
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={"Nature\nScience\nCell\nPNAS, PLOS ONE"} rows={7}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "10px 14px", color: C.textPrimary, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", marginBottom: 16 }}
              onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = C.border2} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
              <button onClick={resolve} disabled={!parsePastedNames(text).length} style={{ ...ghostBtn, background: accent + "22", borderColor: accent + "66", color: accent, cursor: parsePastedNames(text).length ? "pointer" : "not-allowed" }}>
                Resolve {parsePastedNames(text).length > 0 ? `(${parsePastedNames(text).length})` : ""}
              </button>
            </div>
          </>
        )}
        {status === "resolving" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 0" }}>
            <Spinner size={28} color={accent} /><div style={{ fontSize: 12, color: C.textMuted }}>Resolving via OpenAlex...</div>
          </div>
        )}
        {status === "done" && (
          <>
            {resolved.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Resolved — click to toggle</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
                  {resolved.map(j => (
                    <div key={j.id} onClick={() => toggle(j.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 7, cursor: "pointer", background: selected.has(j.id) ? accent + "15" : C.bg, border: `1px solid ${selected.has(j.id) ? accent + "44" : C.border}`, transition: "all 0.15s" }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${selected.has(j.id) ? accent : C.textMuted}`, background: selected.has(j.id) ? accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#000" }}>{selected.has(j.id) ? "✓" : ""}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.display_name}</div>
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                          {j._query !== j.display_name && <span style={{ color: C.textSecondary }}>matched "{j._query}" · </span>}
                          {j.type} · {j.host_organization_name || "—"} · {j.works_count?.toLocaleString()} works
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {failed.length > 0 && <div style={{ fontSize: 11, color: C.red, marginBottom: 16 }}>No match: {failed.join(", ")}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMuted, marginRight: "auto" }}>{selected.size} of {resolved.length} selected</span>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
              <button onClick={confirm} disabled={selected.size === 0} style={{ ...ghostBtn, background: accent + "22", borderColor: accent + "66", color: accent, cursor: selected.size ? "pointer" : "not-allowed" }}>
                Add {selected.size} journal{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function JournalSearchBox({ label, color, journals, setJournals, disabled }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const debounceRef = useRef(null);
  const accent = color === "A" ? C.blue : C.amber;

  const onInput = (val) => {
    setInput(val); clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { const r = await searchSources(val); setSuggestions(r.filter(r => !journals.find(j => j.id === r.id))); } catch {}
      setSearching(false);
    }, 380);
  };
  const addJournal = (j) => { setJournals(prev => [...prev, j]); setSuggestions([]); setInput(""); };
  const addMany = (list) => setJournals(prev => { const ids = new Set(prev.map(j => j.id)); return [...prev, ...list.filter(j => !ids.has(j.id))]; });
  const removeJournal = (id) => setJournals(prev => prev.filter(j => j.id !== id));

  return (
    <>
      {showPaste && <PasteModal color={color} existing={journals} onAdd={addMany} onClose={() => setShowPaste(false)} />}
      <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent }}>Set {label} — Journals</div>
          <button disabled={disabled} onClick={() => setShowPaste(true)} style={{ ...ghostBtn, padding: "3px 10px", fontSize: 10, color: disabled ? C.border2 : accent + "cc", borderColor: disabled ? C.border : accent + "33", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paste list</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 32 }}>
          {journals.map(j => <JournalPill key={j.id} journal={j} onRemove={removeJournal} color={color} />)}
        </div>
        <div style={{ position: "relative" }}>
          <input disabled={disabled} value={input} onChange={e => onInput(e.target.value)} placeholder="Search and add one journal..."
            style={{ width: "100%", background: "#1a1f2e", border: `1px solid ${journals.length ? accent + "44" : C.border2}`, borderRadius: 8, padding: "9px 14px", color: C.textPrimary, fontSize: 13, outline: "none", transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = accent}
            onBlur={e => { e.target.style.borderColor = journals.length ? accent + "44" : C.border2; setTimeout(() => setSuggestions([]), 200); }} />
          {searching && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}><Spinner size={13} color={accent} /></div>}
        </div>
        {suggestions.length > 0 && (
          <div style={{ position: "absolute", zIndex: 50, left: 0, right: 0, background: "#1e2436", border: `1px solid ${accent}22`, borderRadius: 8, marginTop: 4, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            {suggestions.map(s => (
              <div key={s.id} onMouseDown={() => addJournal(s)} style={{ padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${C.border}22`, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = accent + "15"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ fontSize: 13, color: C.textPrimary }}>{s.display_name}</div>
                <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>{s.type} · {s.host_organization_name || "—"} · {s.works_count?.toLocaleString()} works</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
