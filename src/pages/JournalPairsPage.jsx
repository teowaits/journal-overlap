import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { downloadCsv, computeJournalPairs } from "../utils.js";
import { ExportButton } from "../components/shared.jsx";

export default function JournalPairsPage({ results }) {
  const pairs = useMemo(() => computeJournalPairs(results), [results]);
  const [sortKey, setSortKey] = useState("authors");
  const maxAuthors = pairs[0]?.authors || 1;

  const sorted = [...pairs].sort((a, b) => {
    if (sortKey === "authors") return b.authors - a.authors;
    if (sortKey === "worksA") return b.worksA - a.worksA;
    if (sortKey === "worksB") return b.worksB - a.worksB;
    return 0;
  });

  if (!pairs.length) return (
    <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
      Run a search first to see journal pair analysis.
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
          Journal Community Overlap
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>Each row is a Set A x Set B journal pair. Authors who published in both are counted once per pair.
          {pairs.length > 1 && ` ${pairs.length} distinct pairs found.`}</span>
          <ExportButton onClick={() => downloadCsv("journal-pairs.csv",
            ["Journal A", "Journal B", "Shared Authors", "Works in A", "Works in B"],
            sorted.map(p => [p.journalA, p.journalB, p.authors, p.worksA, p.worksB])
          )} />
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
          Top {Math.min(20, sorted.length)} Pairs by Shared Authors
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.slice(0, 20).map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, fontSize: 10, color: C.textMuted, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                  <span style={{ color: C.blueLight }}>{p.journalA}</span>
                  <span style={{ color: C.textMuted }}> x </span>
                  <span style={{ color: C.amberLight }}>{p.journalB}</span>
                </div>
                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: C.border2 }}>
                  <div style={{ width: `${(p.authors / maxAuthors) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.green})`, transition: "width 0.5s ease" }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0 }}>
                {p.authors}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11 }}>
        <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
        {[{ key: "authors", label: "Shared Authors" }, { key: "worksA", label: "Set A Works" }, { key: "worksB", label: "Set B Works" }].map(({ key, label }) => (
          <button key={key} onClick={() => setSortKey(key)} style={{
            padding: "4px 12px", borderRadius: 5,
            border: `1px solid ${sortKey === key ? C.border2 : C.border}`,
            background: sortKey === key ? C.surface2 : "transparent",
            color: sortKey === key ? C.textPrimary : C.textMuted,
            cursor: "pointer", fontSize: 11, transition: "all 0.15s",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", color: C.textMuted }}>{pairs.length} pairs</span>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 80px 72px 72px", gap: 8, padding: "8px 16px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${C.border}` }}>
          <div>#</div>
          <div style={{ color: C.blueLight }}>Set A Journal</div>
          <div style={{ color: C.amberLight }}>Set B Journal</div>
          <div style={{ textAlign: "center", color: C.green }}>Authors</div>
          <div style={{ textAlign: "center", color: C.blueLight }}>A Works</div>
          <div style={{ textAlign: "center", color: C.amberLight }}>B Works</div>
        </div>
        {sorted.map((p, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "28px 1fr 1fr 80px 72px 72px",
            gap: 8, padding: "9px 16px", alignItems: "center",
            background: i % 2 === 0 ? C.surface2 : C.surface,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
          }}>
            <div style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</div>
            <div style={{ color: C.blueLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.journalA}</div>
            <div style={{ color: C.amberLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.journalB}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ background: "rgba(154,230,180,0.12)", color: C.green, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{p.authors}</span>
            </div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{p.worksA}</div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{p.worksB}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
