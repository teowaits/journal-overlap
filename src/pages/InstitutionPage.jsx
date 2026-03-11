import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { downloadCsv, computeInstitutionOverlap } from "../utils.js";
import { ExportButton } from "../components/shared.jsx";

export default function InstitutionPage({ results }) {
  const institutions = useMemo(() => computeInstitutionOverlap(results), [results]);
  const [sortKey, setSortKey] = useState("authors");
  const maxAuthors = institutions[0]?.authors || 1;

  const sorted = [...institutions].sort((a, b) => {
    if (sortKey === "authors") return b.authors - a.authors;
    if (sortKey === "overlap") return b.totalOverlap - a.totalOverlap;
    if (sortKey === "citations") return b.totalCitations - a.totalCitations;
    return 0;
  });

  if (!institutions.length) return (
    <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
      Run a search first to see institution analysis.
    </div>
  );

  const top20 = sorted.slice(0, 20);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
          Institution Overlap
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>Institutions whose researchers bridge both journal sets. One author may count for multiple institutions.
          {institutions.length > 1 && ` ${institutions.length} institutions found.`}</span>
          <ExportButton onClick={() => downloadCsv("institutions-overlap.csv",
            ["Rank", "Institution", "Bridging Authors", "Total Overlap Works", "Total Citations"],
            sorted.map((inst, i) => [i + 1, inst.name, inst.authors, inst.totalOverlap, inst.totalCitations])
          )} />
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
          Top {top20.length} Institutions by Bridging Authors
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {top20.map((inst, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, fontSize: 10, color: C.textMuted, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                  {inst.name}
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.border2, position: "relative" }}>
                  <div style={{
                    width: `${(inst.authors / maxAuthors) * 100}%`,
                    background: `linear-gradient(90deg, ${C.blue}cc, ${C.amber}cc)`,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.blueLight, fontWeight: 700, width: 32, textAlign: "right", flexShrink: 0 }}>
                {inst.authors}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11 }}>
        <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
        {[
          { key: "authors", label: "Bridging Authors" },
          { key: "overlap", label: "Total Overlap Score" },
          { key: "citations", label: "Total Citations" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setSortKey(key)} style={{
            padding: "4px 12px", borderRadius: 5,
            border: `1px solid ${sortKey === key ? C.border2 : C.border}`,
            background: sortKey === key ? C.surface2 : "transparent",
            color: sortKey === key ? C.textPrimary : C.textMuted,
            cursor: "pointer", fontSize: 11, transition: "all 0.15s",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", color: C.textMuted }}>{institutions.length} institutions</span>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div className="inst-grid-header" style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 130px", gap: 8, padding: "8px 16px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${C.border}` }}>
          <div>#</div>
          <div>Institution</div>
          <div style={{ textAlign: "center", color: C.blueLight }}>Authors</div>
          <div style={{ textAlign: "center" }}>Overlap Score</div>
          <div className="hide-mobile" style={{ textAlign: "center" }}>Total Citations</div>
        </div>
        {sorted.map((inst, i) => (
          <div key={i} className="inst-grid-row" style={{
            display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 130px",
            gap: 8, padding: "9px 16px", alignItems: "center",
            background: i % 2 === 0 ? C.surface2 : C.surface,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
          }}>
            <div style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</div>
            <div style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ background: "rgba(99,179,237,0.15)", color: C.blueLight, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{inst.authors}</span>
            </div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{inst.totalOverlap.toLocaleString()}</div>
            <div className="hide-mobile" style={{ textAlign: "center", color: C.textSecondary }}>{inst.totalCitations.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
