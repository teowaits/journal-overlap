import { useState } from "react";
import { C } from "../constants.js";
import { shortId } from "../utils.js";

function ArticleList({ works, color }) {
  const accent = color === "A" ? C.blue : C.amber;
  const labelColor = color === "A" ? C.blueLight : C.amberLight;
  const bg = color === "A" ? "rgba(99,179,237,0.07)" : "rgba(246,173,85,0.07)";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, fontWeight: 700 }}>Set {color} Articles ({works.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {works.map(w => (
          <div key={w.id} style={{ background: bg, border: `1px solid ${accent}22`, borderRadius: 6, padding: "7px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 12, color: "#cbd5e0", lineHeight: 1.4 }}>
              {w.title
                ? (w.doi ? <a href={w.doi} target="_blank" rel="noreferrer" style={{ color: "#cbd5e0", textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.color = accent} onMouseLeave={e => e.currentTarget.style.color = "#cbd5e0"}>{w.title}</a> : w.title)
                : <span style={{ color: C.textMuted, fontStyle: "italic" }}>No title available</span>}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {w.journal && <span style={{ color: labelColor, opacity: 0.8 }}>{w.journal}</span>}
              {w.year && <span>{w.year}</span>}
              {w.doi && (
                <a href={w.doi} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: "none", fontSize: 10, border: `1px solid ${C.border2}`, borderRadius: 3, padding: "1px 5px", transition: "color 0.1s, border-color 0.1s" }}
                  onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border2; }}>DOI</a>
              )}
              <a href={w.id} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: "none", fontSize: 10, border: `1px solid ${C.border2}`, borderRadius: 3, padding: "1px 5px", transition: "color 0.1s, border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#a0aec0"; e.currentTarget.style.borderColor = C.textMuted; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border2; }}>OA</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuthorRow({ author, index, fromYear }) {
  const [expanded, setExpanded] = useState(false);
  const inst = author.enriched?.last_known_institutions?.[0]?.display_name || [...author.institutions].slice(0, 1)[0] || "—";
  const totalCitations = author.enriched?.cited_by_count ?? "—";
  const orcid = author.enriched?.orcid;
  const name = author.enriched?.display_name || shortId(author.id);
  const overlapScore = author.worksInA + author.worksInB;

  return (
    <div style={{ background: index % 2 === 0 ? C.surface2 : C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div className="author-grid-row" onClick={() => setExpanded(e => !e)} style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 80px 100px 24px", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer" }}
        onMouseEnter={e => e.currentTarget.style.background = C.border} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center" }}>{index + 1}</div>
        <div>
          <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst}</div>
        </div>
        <div style={{ textAlign: "center" }}><span style={{ background: "rgba(99,179,237,0.15)", color: C.blueLight, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{author.worksInA}</span></div>
        <div style={{ textAlign: "center" }}><span style={{ background: "rgba(246,173,85,0.15)", color: C.amberLight, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{author.worksInB}</span></div>
        <div style={{ textAlign: "center" }}><span style={{ background: "rgba(154,230,180,0.12)", color: C.green, borderRadius: 4, padding: "2px 8px", fontSize: 13, fontWeight: 700 }}>{overlapScore}</span></div>
        <div className="hide-mobile" style={{ textAlign: "center", fontSize: 12, color: C.textSecondary }}>{typeof totalCitations === "number" ? totalCitations.toLocaleString() : "—"}</div>
        <div className="hide-mobile" style={{ color: C.textMuted, fontSize: 11, textAlign: "center" }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ padding: "16px 16px 16px 52px", background: "#0f1320", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: C.textSecondary }}>
            <div>
              <div style={{ color: C.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>OpenAlex</div>
              <a href={author.id} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>{shortId(author.id)}</a>
            </div>
            {orcid && <div>
              <div style={{ color: C.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>ORCID</div>
              <a href={orcid} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>{orcid.replace("https://orcid.org/", "")}</a>
            </div>}
            <div>
              <div style={{ color: C.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>Institutions ({fromYear}–present)</div>
              <div style={{ color: "#a0aec0", marginTop: 2 }}>{[...author.institutions].join(" · ") || "—"}</div>
            </div>
            <div>
              <div style={{ color: C.textMuted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>Career Works</div>
              <div style={{ marginTop: 2 }}>{author.enriched?.works_count?.toLocaleString() ?? "—"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}><ArticleList works={author.articlesInA} color="A" /></div>
            <div style={{ flex: 1, minWidth: 260 }}><ArticleList works={author.articlesInB} color="B" /></div>
          </div>
        </div>
      )}
    </div>
  );
}
