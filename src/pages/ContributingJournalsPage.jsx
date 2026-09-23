import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { downloadCsv, computeContributingJournals } from "../utils.js";
import { ExportButton } from "../components/shared.jsx";

/**
 * Exclusive-mode replacement for Journal Pairs: which Set A journals
 * contribute the most candidate authors (published in A, not yet in B).
 */
export default function ContributingJournalsPage({ results, journalsA }) {
  const rows = useMemo(
    () => computeContributingJournals(results, journalsA),
    [results, journalsA]
  );
  const [sortKey, setSortKey] = useState("authors");
  const maxAuthors = rows[0]?.exclusiveAuthorCount || 1;

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "authors") return b.exclusiveAuthorCount - a.exclusiveAuthorCount;
    if (sortKey === "worksA") return b.worksA - a.worksA;
    return 0;
  });

  if (!rows.length) return (
    <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
      Run an exclusive search first to see which Set A journals contribute candidate authors.
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
          Contributing Journals
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            Set A journals ranked by how many candidate authors they contribute
            (published in Set A, not yet in Set B). An author counts once per journal.
            {rows.length > 1 && ` ${rows.length} journals found.`}
          </span>
          <ExportButton onClick={() => downloadCsv("contributing-journals.csv",
            ["Rank", "Set A Journal", "OpenAlex Source ID", "Candidate Authors", "Set A Works"],
            sorted.map((r, i) => [i + 1, r.sourceName, r.sourceId || "", r.exclusiveAuthorCount, r.worksA])
          )} />
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
          Top {Math.min(20, sorted.length)} by Candidate Authors
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.slice(0, 20).map((r, i) => (
            <div key={r.sourceName} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, fontSize: 10, color: C.textMuted, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.blueLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                  {r.sourceName}
                </div>
                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: C.border2 }}>
                  <div style={{
                    width: `${(r.exclusiveAuthorCount / maxAuthors) * 100}%`,
                    background: `linear-gradient(90deg, ${C.blue}, ${C.green})`,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0 }}>
                {r.exclusiveAuthorCount}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11 }}>
        <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
        {[
          { key: "authors", label: "Candidate Authors" },
          { key: "worksA", label: "Set A Works" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setSortKey(key)} style={{
            padding: "4px 12px", borderRadius: 5,
            border: `1px solid ${sortKey === key ? C.border2 : C.border}`,
            background: sortKey === key ? C.surface2 : "transparent",
            color: sortKey === key ? C.textPrimary : C.textMuted,
            cursor: "pointer", fontSize: 11, transition: "all 0.15s",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", color: C.textMuted }}>{rows.length} journals</span>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 90px", gap: 8, padding: "8px 16px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${C.border}` }}>
          <div>#</div>
          <div style={{ color: C.blueLight }}>Set A Journal</div>
          <div style={{ textAlign: "center", color: C.green }}>Authors</div>
          <div style={{ textAlign: "center", color: C.blueLight }}>A Works</div>
        </div>
        {sorted.map((r, i) => (
          <div key={r.sourceName} style={{
            display: "grid", gridTemplateColumns: "28px 1fr 100px 90px",
            gap: 8, padding: "9px 16px", alignItems: "center",
            background: i % 2 === 0 ? C.surface2 : C.surface,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
          }}>
            <div style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</div>
            <div style={{ color: C.blueLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sourceName}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ background: "rgba(154,230,180,0.12)", color: C.green, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{r.exclusiveAuthorCount}</span>
            </div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{r.worksA}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
