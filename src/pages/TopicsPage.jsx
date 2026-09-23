import { useState, useMemo, useEffect } from "react";
import { C, LEVEL_LABELS, LEVEL_ORDER, ghostBtn } from "../constants.js";
import {
  downloadCsv,
  computeTopicOverlap,
  computeTopicsExclusive,
  computeRelativeTopicGaps,
} from "../utils.js";
import {
  estimateTopicGapCost,
  fetchSubfieldHistograms,
  yearRangeForLookback,
} from "../api.js";
import { ExportButton } from "../components/shared.jsx";

function TopicGapPanel({ journalsA, journalsB, fromYear, lookback }) {
  const [phase, setPhase] = useState("idle"); // idle | running | done | error
  const [gaps, setGaps] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");

  const costHint = useMemo(
    () => estimateTopicGapCost(journalsA.length, journalsB.length),
    [journalsA.length, journalsB.length]
  );

  const run = async () => {
    if (!journalsA.length || !journalsB.length) return;
    setPhase("running");
    setError("");
    setGaps([]);
    try {
      const yearA = { start: fromYear };
      const yearB = yearRangeForLookback(lookback || "sameWindow", { start: fromYear });
      const { histA, histB, calls, costUsd } = await fetchSubfieldHistograms(
        journalsA.map(j => j.id),
        journalsB.map(j => j.id),
        yearA,
        yearB
      );
      const found = computeRelativeTopicGaps(histA, histB);
      setGaps(found);
      setMeta({
        calls,
        costUsd,
        totalA: histA.totalWorks,
        totalB: histB.totalWorks,
        groupsA: histA.groups.size,
        groupsB: histB.groups.size,
      });
      setPhase("done");
    } catch (e) {
      setError(e.message || String(e));
      setPhase("error");
    }
  };

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "16px 18px",
      marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
            Corpus topic gaps (Subfield)
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.55 }}>
            On-demand: subfields meaningfully present in Set A&apos;s full article corpus that are
            proportionally scarce in Set B&apos;s corpus — independent of which authors wrote them.
            Uses cheap <code style={{ color: C.textSecondary }}>group_by</code> calls, not a full works fetch.
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            onClick={run}
            disabled={phase === "running" || !journalsA.length || !journalsB.length}
            style={{
              ...ghostBtn,
              padding: "8px 14px",
              color: phase === "running" ? C.textMuted : C.blueLight,
              borderColor: C.blue + "55",
              cursor: phase === "running" ? "wait" : "pointer",
            }}
          >
            {phase === "running" ? "Scanning…" : "Find topic gaps"}
          </button>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>
            ~{costHint.estimatedCalls} calls ≈ ${costHint.estimatedCostUsd.toFixed(4)}
          </div>
        </div>
      </div>

      {phase === "error" && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.red }}>Error: {error}</div>
      )}

      {phase === "done" && meta && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              {gaps.length} gap{gaps.length === 1 ? "" : "s"} · A {meta.totalA.toLocaleString()} works
              ({meta.groupsA} subfields) · B {meta.totalB.toLocaleString()} works ({meta.groupsB} subfields)
              · {meta.calls} calls ≈ ${meta.costUsd.toFixed(4)}
            </span>
            {gaps.length > 0 && (
              <ExportButton onClick={() => downloadCsv("topic-gaps-subfield.csv",
                ["Rank", "Subfield", "OpenAlex ID", "Works A", "Share A", "Works B", "Share B", "Enrichment A/B"],
                gaps.map((g, i) => [
                  i + 1,
                  g.name,
                  g.id,
                  g.countA,
                  (g.shareA * 100).toFixed(2) + "%",
                  g.countB,
                  (g.shareB * 100).toFixed(2) + "%",
                  g.enrichment === Infinity ? "∞" : g.enrichment.toFixed(1),
                ])
              )} />
            )}
          </div>
          {gaps.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted }}>
              No relative subfield gaps under the current thresholds (A ≥1% or ≥5 works; B share ≤25% of A&apos;s share).
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "28px 1fr 72px 72px 72px 72px 64px",
                gap: 8, padding: "8px 12px", fontSize: 10, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}`,
              }}>
                <div>#</div>
                <div>Subfield</div>
                <div style={{ textAlign: "center", color: C.blueLight }}>A works</div>
                <div style={{ textAlign: "center", color: C.blueLight }}>A %</div>
                <div style={{ textAlign: "center", color: C.amberLight }}>B works</div>
                <div style={{ textAlign: "center", color: C.amberLight }}>B %</div>
                <div style={{ textAlign: "center", color: C.green }}>A/B</div>
              </div>
              {gaps.slice(0, 40).map((g, i) => (
                <div key={g.id} style={{
                  display: "grid", gridTemplateColumns: "28px 1fr 72px 72px 72px 72px 64px",
                  gap: 8, padding: "8px 12px", fontSize: 12, alignItems: "center",
                  background: i % 2 === 0 ? C.surface2 : C.surface,
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</div>
                  <div style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.name}>{g.name}</div>
                  <div style={{ textAlign: "center", color: C.textSecondary }}>{g.countA.toLocaleString()}</div>
                  <div style={{ textAlign: "center", color: C.textSecondary }}>{(g.shareA * 100).toFixed(1)}%</div>
                  <div style={{ textAlign: "center", color: C.textSecondary }}>{g.countB.toLocaleString()}</div>
                  <div style={{ textAlign: "center", color: C.textSecondary }}>{(g.shareB * 100).toFixed(1)}%</div>
                  <div style={{ textAlign: "center", color: C.green, fontWeight: 600 }}>
                    {g.enrichment === Infinity ? "∞" : `${g.enrichment.toFixed(1)}×`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopicsPage({ results, journalsA, journalsB, mode = "overlap", fromYear, lookback }) {
  const exclusive = mode === "exclusive";
  const topicData = useMemo(
    () => (exclusive ? computeTopicsExclusive(results) : computeTopicOverlap(results)),
    [results, exclusive]
  );
  const [activeLevel, setActiveLevel] = useState("field");
  const [sortKey, setSortKey] = useState(exclusive ? "authors" : "overlap");

  useEffect(() => {
    setSortKey(exclusive ? "authors" : "overlap");
  }, [exclusive]);

  if (!results.length) return (
    <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
      Run a search first to see topic analysis.
    </div>
  );

  const rows = topicData[activeLevel] || [];
  const sorted = [...rows].sort((a, b) => {
    if (exclusive) {
      if (sortKey === "authors") return b.authorCount - a.authorCount;
      if (sortKey === "worksA") return b.worksA - a.worksA;
      return 0;
    }
    if (sortKey === "overlap")  return b.authorsOverlap - a.authorsOverlap;
    if (sortKey === "authorsA") return b.authorsA - a.authorsA;
    if (sortKey === "authorsB") return b.authorsB - a.authorsB;
    if (sortKey === "worksA")   return b.worksA - a.worksA;
    if (sortKey === "worksB")   return b.worksB - a.worksB;
    return 0;
  });

  const primaryMetric = (row) => exclusive ? row.authorCount : row.authorsOverlap;
  const maxPrimary = primaryMetric(sorted[0]) || 1;
  const top20 = sorted.slice(0, 20);

  const levelColor = { domain: "#b794f4", field: "#76e4f7", subfield: "#9ae6b4", topic: "#fbd38d" };
  const lc = levelColor[activeLevel];

  const levelCount = (lv) => exclusive
    ? (topicData[lv]?.length || 0)
    : (topicData[lv]?.filter(r => r.authorsOverlap > 0).length || 0);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4 }}>
          {exclusive ? "Topics of Candidate Authors" : "Topic Community Overlap"}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            Based on <code style={{ color: C.textSecondary, fontSize: 11 }}>primary_topic</code> assigned by OpenAlex to each article.
            {exclusive
              ? " Counts candidate authors (published in Set A, not yet in Set B) whose Set A articles fall under each topic."
              : " An author counts toward a topic if they published in both Set A and Set B under that topic."}
          </span>
          <ExportButton onClick={() => {
            if (exclusive) {
              downloadCsv(`topics-exclusive-${activeLevel}.csv`,
                ["Rank", LEVEL_LABELS[activeLevel], "Candidate Authors", "Set A Works"],
                sorted.map((row, i) => [i + 1, row.name, row.authorCount, row.worksA])
              );
            } else {
              downloadCsv(`topics-${activeLevel}.csv`,
                ["Rank", LEVEL_LABELS[activeLevel], "Overlap Authors", "Set A Authors", "Set B Authors", "Set A Works", "Set B Works"],
                sorted.map((row, i) => [i + 1, row.name, row.authorsOverlap, row.authorsA, row.authorsB, row.worksA, row.worksB])
              );
            }
          }} />
          {!exclusive && (
            <ExportButton label="Export for Gem Finder" onClick={() => {
              const setAName = (journalsA || []).map(j => j.display_name).join(", ");
              const setBName = (journalsB || []).map(j => j.display_name).join(", ");
              const note = `from journal-overlap · Topics tab · ${setAName} × ${setBName}`;
              const allRows = [
                ...topicData.topic.map(r => ({ ...r, gemType: "topic" })),
                ...topicData.subfield.map(r => ({ ...r, gemType: "subfield" })),
              ].sort((a, b) => b.authorsOverlap - a.authorsOverlap);
              const today = new Date().toISOString().split("T")[0];
              downloadCsv(`journal-overlap-gem-finder-topics-${today}.csv`,
                ["type", "OpenAlex ID", "display_name", "notes"],
                allRows.map(r => [r.gemType, r.id, r.name, note])
              );
            }} />
          )}
        </div>

        {exclusive && (
          <TopicGapPanel
            journalsA={journalsA || []}
            journalsB={journalsB || []}
            fromYear={fromYear}
            lookback={lookback}
          />
        )}

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
                ({levelCount(lv)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {(activeLevel === "subfield" || activeLevel === "topic") && sorted.length > 0 && (() => {
        const cloudWords = exclusive
          ? sorted.slice(0, activeLevel === "topic" ? 120 : 60)
          : sorted.filter(r => r.authorsOverlap > 0).slice(0, activeLevel === "topic" ? 120 : 60);
        if (!cloudWords.length) return null;
        const maxO = primaryMetric(cloudWords[0]);
        const minO = primaryMetric(cloudWords[cloudWords.length - 1]);
        const sizeMin = activeLevel === "topic" ? 10 : 12;
        const sizeMax = activeLevel === "topic" ? 28 : 34;
        const tagged = cloudWords.map(r => {
          const m = primaryMetric(r);
          const norm = maxO === minO ? 1 : (m - minO) / (maxO - minO);
          const size = Math.round(sizeMin + norm * (sizeMax - sizeMin));
          let color = lc;
          if (!exclusive) {
            const ratioA = r.authorsA / ((r.authorsA + r.authorsB) || 1);
            color = ratioA > 0.62 ? C.blueLight : ratioA < 0.38 ? C.amberLight : lc;
          }
          return { ...r, size, color, metric: m };
        }).sort(() => Math.random() - 0.5);
        return (
          <div style={{ background: C.surface, border: `1px solid ${lc}22`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              {LEVEL_LABELS[activeLevel]} Word Cloud
              <span style={{ marginLeft: 8, color: lc, opacity: 0.7 }}>
                -- top {tagged.length} by {exclusive ? "candidate authors" : "overlap"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
              {exclusive ? (
                <>Size = candidate authors with Set A articles in this {LEVEL_LABELS[activeLevel].toLowerCase()}</>
              ) : (
                <>
                  Size = bridging authors ·{" "}
                  <span style={{ color: C.blueLight }}>■</span> Set A dominant ·{" "}
                  <span style={{ color: lc }}>■</span> Balanced ·{" "}
                  <span style={{ color: C.amberLight }}>■</span> Set B dominant
                </>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 10px", alignItems: "center", lineHeight: 1.6 }}>
              {tagged.map((w, i) => (
                <span key={w.id || i}
                  title={exclusive
                    ? `${w.name} · ${w.metric} candidate authors · ${w.worksA} Set A works`
                    : `${w.name} · ${w.authorsOverlap} bridging authors · ${w.authorsA} Set A · ${w.authorsB} Set B`}
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
            Top {top20.length} {LEVEL_LABELS[activeLevel]}s by {exclusive ? "Candidate Authors" : "Bridging Authors"}
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
                    {exclusive ? (
                      <div style={{ width: `${(row.authorCount / maxPrimary) * 100}%`, background: lc, transition: "width 0.5s ease" }} />
                    ) : (
                      <>
                        <div style={{ width: `${(row.authorsA / maxPrimary) * 100}%`, background: `${C.blue}99`, transition: "width 0.5s ease", minWidth: row.authorsA ? 2 : 0 }} />
                        <div style={{ width: `${(row.authorsOverlap / maxPrimary) * 100}%`, background: lc, transition: "width 0.5s ease", minWidth: row.authorsOverlap ? 2 : 0 }} />
                        <div style={{ width: `${(row.authorsB / maxPrimary) * 100}%`, background: `${C.amber}99`, transition: "width 0.5s ease", minWidth: row.authorsB ? 2 : 0 }} />
                      </>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: lc, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0 }}>
                  {primaryMetric(row)}
                </div>
              </div>
            ))}
          </div>
          {!exclusive && (
            <div style={{ marginTop: 14, fontSize: 10, color: C.textMuted, display: "flex", gap: 16 }}>
              <span><span style={{ color: C.blue }}>■</span> Set A only</span>
              <span><span style={{ color: lc }}>■</span> Both sets (overlap)</span>
              <span><span style={{ color: C.amber }}>■</span> Set B only</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort:</span>
        {(exclusive
          ? [
              { key: "authors", label: "Candidate Authors" },
              { key: "worksA", label: "Set A Works" },
            ]
          : [
              { key: "overlap",  label: "Overlap Authors" },
              { key: "authorsA", label: "Set A Authors" },
              { key: "authorsB", label: "Set B Authors" },
              { key: "worksA",   label: "Set A Works" },
              { key: "worksB",   label: "Set B Works" },
            ]
        ).map(({ key, label }) => (
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
        {exclusive ? (
          <>
            <div className="topic-grid-header" style={{
              display: "grid", gridTemplateColumns: "28px 1fr 120px 90px",
              gap: 8, padding: "8px 16px",
              fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div>#</div>
              <div>{LEVEL_LABELS[activeLevel]}</div>
              <div style={{ textAlign: "center", color: lc }}>Authors</div>
              <div style={{ textAlign: "center", color: C.blueLight }}>A Works</div>
            </div>
            {sorted.map((row, i) => (
              <div key={row.id} className="topic-grid-row" style={{
                display: "grid", gridTemplateColumns: "28px 1fr 120px 90px",
                gap: 8, padding: "9px 16px", alignItems: "center",
                background: i % 2 === 0 ? C.surface2 : C.surface,
                borderBottom: `1px solid ${C.border}`, fontSize: 12,
              }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{i + 1}</div>
                <div style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ background: lc + "22", color: lc, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{row.authorCount}</span>
                </div>
                <div style={{ textAlign: "center", color: C.textMuted }}>{row.worksA}</div>
              </div>
            ))}
          </>
        ) : (
          <>
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
                <div style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ background: lc + "22", color: lc, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{row.authorsOverlap}</span>
                </div>
                <div style={{ textAlign: "center", color: C.textSecondary }}>{row.authorsA}</div>
                <div style={{ textAlign: "center", color: C.textSecondary }}>{row.authorsB}</div>
                <div className="hide-mobile" style={{ textAlign: "center", color: C.textMuted }}>{row.worksA}</div>
                <div className="hide-mobile" style={{ textAlign: "center", color: C.textMuted }}>{row.worksB}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
