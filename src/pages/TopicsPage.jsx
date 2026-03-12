import { useState, useMemo } from "react";
import { C, LEVEL_LABELS, LEVEL_ORDER } from "../constants.js";
import { downloadCsv, computeTopicOverlap } from "../utils.js";
import { ExportButton } from "../components/shared.jsx";

export default function TopicsPage({ results }) {
  const topicData = useMemo(() => computeTopicOverlap(results), [results]);
  const [activeLevel, setActiveLevel] = useState("field");
  const [sortKey, setSortKey] = useState("overlap");

  if (!results.length) return (
    <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
      Run a search first to see topic analysis.
    </div>
  );

  const rows = topicData[activeLevel] || [];
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "overlap")  return b.authorsOverlap - a.authorsOverlap;
    if (sortKey === "authorsA") return b.authorsA - a.authorsA;
    if (sortKey === "authorsB") return b.authorsB - a.authorsB;
    if (sortKey === "worksA")   return b.worksA - a.worksA;
    if (sortKey === "worksB")   return b.worksB - a.worksB;
    return 0;
  });

  const maxOverlap = sorted[0]?.authorsOverlap || 1;
  const top20 = sorted.slice(0, 20);

  const levelColor = { domain: "#b794f4", field: "#76e4f7", subfield: "#9ae6b4", topic: "#fbd38d" };
  const lc = levelColor[activeLevel];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
          Topic Community Overlap
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>Based on <code style={{ color: C.textSecondary, fontSize: 11 }}>primary_topic</code> assigned by OpenAlex to each article.
          An author counts toward a topic if they published in both Set A and Set B under that topic.</span>
          <ExportButton onClick={() => downloadCsv(`topics-${activeLevel}.csv`,
            ["Rank", LEVEL_LABELS[activeLevel], "Overlap Authors", "Set A Authors", "Set B Authors", "Set A Works", "Set B Works"],
            sorted.map((row, i) => [i + 1, row.name, row.authorsOverlap, row.authorsA, row.authorsB, row.worksA, row.worksB])
          )} />
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>Granularity:</span>
          {LEVEL_ORDER.map(lv => (
            <button key={lv} onClick={() => setActiveLevel(lv)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11,
              border: `1px solid ${activeLevel === lv ? levelColor[lv] + "88" : C.border}`,
              background: activeLevel === lv ? levelColor[lv] + "18" : "transparent",
              color: activeLevel === lv ? levelColor[lv] : C.textMuted,
              cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
            }}>
              {LEVEL_LABELS[lv]}
              <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 10 }}>
                ({topicData[lv]?.filter(r => r.authorsOverlap > 0).length || 0})
              </span>
            </button>
          ))}
        </div>
      </div>

      {(activeLevel === "subfield" || activeLevel === "topic") && sorted.length > 0 && (() => {
        const cloudWords = sorted
          .filter(r => r.authorsOverlap > 0)
          .slice(0, activeLevel === "topic" ? 120 : 60);
        if (!cloudWords.length) return null;
        const maxO = cloudWords[0].authorsOverlap;
        const minO = cloudWords[cloudWords.length - 1].authorsOverlap;
        const sizeMin = activeLevel === "topic" ? 10 : 12;
        const sizeMax = activeLevel === "topic" ? 28 : 34;
        const tagged = cloudWords.map(r => {
          const norm = maxO === minO ? 1 : (r.authorsOverlap - minO) / (maxO - minO);
          const size = Math.round(sizeMin + norm * (sizeMax - sizeMin));
          const ratioA = r.authorsA / ((r.authorsA + r.authorsB) || 1);
          const color = ratioA > 0.62 ? C.blueLight : ratioA < 0.38 ? C.amberLight : lc;
          return { ...r, size, color };
        }).sort(() => Math.random() - 0.5);
        return (
          <div style={{ background: C.surface, border: `1px solid ${lc}22`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              {LEVEL_LABELS[activeLevel]} Word Cloud
              <span style={{ marginLeft: 8, color: lc, opacity: 0.7 }}>-- top {tagged.length} by overlap</span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
              Size = bridging authors ·{" "}
              <span style={{ color: C.blueLight }}>■</span> Set A dominant ·{" "}
              <span style={{ color: lc }}>■</span> Balanced ·{" "}
              <span style={{ color: C.amberLight }}>■</span> Set B dominant
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 10px", alignItems: "center", lineHeight: 1.6 }}>
              {tagged.map((w, i) => (
                <span key={w.id || i} title={`${w.name} · ${w.authorsOverlap} bridging authors · ${w.authorsA} Set A · ${w.authorsB} Set B`}
                  style={{
                    fontSize: w.size, color: w.color, opacity: 0.88,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontWeight: w.size > 22 ? 700 : w.size > 15 ? 500 : 400,
                    cursor: "default", display: "inline-block",
                    transition: "opacity 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "scale(1)"; }}
                >
                  {w.name}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {top20.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
            Top {top20.length} {LEVEL_LABELS[activeLevel]}s by Bridging Authors
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {top20.map((row, i) => (
              <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, fontSize: 10, color: C.textMuted, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                    {row.name}
                  </div>
                  <div style={{ display: "flex", height: 7, borderRadius: 3, overflow: "hidden", background: C.border2 }}>
                    <div style={{ width: `${(row.authorsA / maxOverlap) * 100}%`, background: `${C.blue}99`, transition: "width 0.5s ease", minWidth: row.authorsA ? 2 : 0 }} />
                    <div style={{ width: `${(row.authorsOverlap / maxOverlap) * 100}%`, background: lc, transition: "width 0.5s ease", minWidth: row.authorsOverlap ? 2 : 0 }} />
                    <div style={{ width: `${(row.authorsB / maxOverlap) * 100}%`, background: `${C.amber}99`, transition: "width 0.5s ease", minWidth: row.authorsB ? 2 : 0 }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: lc, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0 }}>
                  {row.authorsOverlap}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 10, color: C.textMuted, display: "flex", gap: 16 }}>
            <span><span style={{ color: C.blue }}>■</span> Set A only</span>
            <span><span style={{ color: lc }}>■</span> Both sets (overlap)</span>
            <span><span style={{ color: C.amber }}>■</span> Set B only</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
        {[
          { key: "overlap",  label: "Overlap Authors" },
          { key: "authorsA", label: "Set A Authors" },
          { key: "authorsB", label: "Set B Authors" },
          { key: "worksA",   label: "Set A Works" },
          { key: "worksB",   label: "Set B Works" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setSortKey(key)} style={{
            padding: "4px 12px", borderRadius: 5,
            border: `1px solid ${sortKey === key ? C.border2 : C.border}`,
            background: sortKey === key ? C.surface2 : "transparent",
            color: sortKey === key ? C.textPrimary : C.textMuted,
            cursor: "pointer", fontSize: 11, transition: "all 0.15s",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", color: C.textMuted }}>
          {sorted.length} {LEVEL_LABELS[activeLevel].toLowerCase()}s
        </span>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div className="topic-grid-header" style={{
          display: "grid", gridTemplateColumns: "28px 1fr 100px 90px 90px 72px 72px",
          gap: 8, padding: "8px 16px",
          fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div>#</div>
          <div>{LEVEL_LABELS[activeLevel]}</div>
          <div style={{ textAlign: "center", color: lc }}>Overlap</div>
          <div style={{ textAlign: "center", color: C.blueLight }}>A Authors</div>
          <div style={{ textAlign: "center", color: C.amberLight }}>B Authors</div>
          <div className="hide-mobile" style={{ textAlign: "center", color: C.blueLight }}>A Works</div>
          <div className="hide-mobile" style={{ textAlign: "center", color: C.amberLight }}>B Works</div>
        </div>
        {sorted.map((row, i) => (
          <div key={row.id} className="topic-grid-row" style={{
            display: "grid", gridTemplateColumns: "28px 1fr 100px 90px 90px 72px 72px",
            gap: 8, padding: "9px 16px", alignItems: "center",
            background: i % 2 === 0 ? C.surface2 : C.surface,
            borderBottom: `1px solid ${C.border}`, fontSize: 12,
          }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>{i + 1}</div>
            <div style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.name}
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ background: lc + "22", color: lc, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>
                {row.authorsOverlap}
              </span>
            </div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{row.authorsA}</div>
            <div style={{ textAlign: "center", color: C.textSecondary }}>{row.authorsB}</div>
            <div className="hide-mobile" style={{ textAlign: "center", color: C.textMuted }}>{row.worksA}</div>
            <div className="hide-mobile" style={{ textAlign: "center", color: C.textMuted }}>{row.worksB}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
