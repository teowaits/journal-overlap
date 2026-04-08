import { useState, useMemo } from "react";
import { C, ghostBtn, PAGE_SIZE } from "../constants.js";
import { downloadCsv } from "../utils.js";
import { ExportButton } from "../components/shared.jsx";
import WordCloud from "../components/WordCloud.jsx";
import AuthorRow from "../components/AuthorRow.jsx";

export default function DashboardPage({ results, totalOverlap, sortKey, setSortKey, journalsA, journalsB, fromYear }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sorted = useMemo(() => [...results].sort((a, b) => {
    if (sortKey === "overlap") return (b.worksInA + b.worksInB) - (a.worksInA + a.worksInB);
    if (sortKey === "citations") return (b.enriched?.cited_by_count ?? 0) - (a.enriched?.cited_by_count ?? 0);
    if (sortKey === "setA") return b.worksInA - a.worksInA;
    if (sortKey === "setB") return b.worksInB - a.worksInB;
    return 0;
  }), [results, sortKey]);
  const visible = sorted.slice(0, visibleCount);

  const isCapped = totalOverlap > results.length && results.length > 0;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {results.length > 0 && <WordCloud results={results} />}

      {sorted.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 11, flexWrap: "wrap" }}>
            <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
            {[{ key: "overlap", label: "Overlap" }, { key: "setA", label: "Set A" }, { key: "setB", label: "Set B" }, { key: "citations", label: "Citations" }].map(({ key, label }) => (
              <button key={key} onClick={() => setSortKey(key)} style={{
                padding: "4px 12px", borderRadius: 5,
                border: `1px solid ${sortKey === key ? C.border2 : C.border}`,
                background: sortKey === key ? C.surface2 : "transparent",
                color: sortKey === key ? C.textPrimary : C.textMuted,
                cursor: "pointer", fontSize: 11, transition: "all 0.15s",
              }}>{label}</button>
            ))}
            <span style={{ marginLeft: "auto", color: C.textMuted, display: "flex", alignItems: "center", gap: 10 }}>
              {sorted.length.toLocaleString()} authors · click row to expand
              <ExportButton onClick={() => downloadCsv("authors-overlap.csv",
                ["type", "Rank", "Name", "Institution", "Set A Works", "Set B Works", "Overlap Score", "Career Citations", "ORCID", "OpenAlex ID", "Note"],
                sorted.map((a, i) => ["author", i + 1, a.enriched?.display_name || a.id.replace("https://openalex.org/",""), a.enriched?.last_known_institutions?.[0]?.display_name || [...a.institutions][0] || "", a.worksInA, a.worksInB, a.worksInA + a.worksInB, a.enriched?.cited_by_count ?? "", a.enriched?.orcid || "", a.id, `from journal-overlap · ${journalsA.map(j => j.display_name).join(", ")} × ${journalsB.map(j => j.display_name).join(", ")}`])
              )} />
            </span>
          </div>

          <div className="author-grid-header" style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 80px 100px 24px", gap: 8, padding: "8px 16px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ textAlign: "center" }}>#</div>
            <div>Author · Institution</div>
            <div style={{ textAlign: "center", color: C.blueLight }}>Set A</div>
            <div style={{ textAlign: "center", color: C.amberLight }}>Set B</div>
            <div style={{ textAlign: "center", color: C.green }}>Overlap</div>
            <div className="hide-mobile" style={{ textAlign: "center" }}>Citations</div>
            <div className="hide-mobile" />
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginTop: 4 }}>
            {visible.map((author, i) => <AuthorRow key={author.id} author={author} index={i} fromYear={fromYear} />)}
          </div>

          {visibleCount < sorted.length && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => setVisibleCount(prev => Math.min(prev + PAGE_SIZE, sorted.length))} style={{
                ...ghostBtn, padding: "10px 28px", fontSize: 12, color: C.blueLight, borderColor: C.blue + "44",
              }}>
                Show more ({Math.min(PAGE_SIZE, sorted.length - visibleCount)} of {(sorted.length - visibleCount).toLocaleString()} remaining)
              </button>
            </div>
          )}

          {isCapped && (
            <div style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, background: "rgba(246,173,85,0.08)", border: `1px solid ${C.amber}33`, fontSize: 12, color: C.amber }}>
              Showing top {results.length.toLocaleString()} of {totalOverlap.toLocaleString()} overlapping authors. Increase the limit and re-run to see more.
            </div>
          )}

          <div style={{ marginTop: 14, fontSize: 11, color: C.textMuted, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span><span style={{ color: C.blueLight }}>■</span> Set A: {journalsA.map(j => j.display_name).join(", ")}</span>
            <span><span style={{ color: C.amberLight }}>■</span> Set B: {journalsB.map(j => j.display_name).join(", ")}</span>
            <span>Citations = career total · Overlap = A + B article count ({fromYear}–present)</span>
          </div>
        </>
      )}
    </div>
  );
}
