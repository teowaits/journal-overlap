import { useState, useCallback, useRef, useEffect } from "react";
import { BASE, PER_PAGE, DEFAULT_FROM_YEAR, YEAR_OPTIONS, CAP_OPTIONS, C, ghostBtn } from "./constants.js";
import { sleep, chunkArray } from "./utils.js";
import { apiFetch, resolveJournalNames, fetchWorksForSources } from "./api.js";
import { Spinner, ProgressBar } from "./components/shared.jsx";
import JournalSearchBox from "./components/JournalSearch.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import JournalPairsPage from "./pages/JournalPairsPage.jsx";
import InstitutionPage from "./pages/InstitutionPage.jsx";
import TopicsPage from "./pages/TopicsPage.jsx";

export default function App() {
  const [journalsA, setJournalsA] = useState([]);
  const [journalsB, setJournalsB] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ a: 0, aTotal: 0, b: 0, bTotal: 0, enrich: 0, enrichTotal: 0 });
  const [results, setResults] = useState([]);
  const [totalOverlap, setTotalOverlap] = useState(0);
  const [sortKey, setSortKey] = useState("overlap");
  const [resultCap, setResultCap] = useState(500);
  const [fromYear, setFromYear] = useState(DEFAULT_FROM_YEAR);
  const [errorMsg, setErrorMsg] = useState("");
  const [activePage, setActivePage] = useState("dashboard");
  const abortRef = useRef(null);
  const initializedFromUrl = useRef(false);

  // Load journals from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aParam = params.get("a");
    const bParam = params.get("b");
    if (!aParam && !bParam) return;
    (async () => {
      const loadSet = async (param) => {
        if (!param) return [];
        const names = param.split("|").map(s => s.trim()).filter(Boolean);
        const { resolved } = await resolveJournalNames(names);
        return resolved;
      };
      const [a, b] = await Promise.all([loadSet(aParam), loadSet(bParam)]);
      if (a.length) setJournalsA(a);
      if (b.length) setJournalsB(b);
      initializedFromUrl.current = true;
    })();
  }, []);

  // Update URL when journals change
  useEffect(() => {
    const params = new URLSearchParams();
    if (journalsA.length) params.set("a", journalsA.map(j => j.display_name).join("|"));
    if (journalsB.length) params.set("b", journalsB.map(j => j.display_name).join("|"));
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [journalsA, journalsB]);

  const addLog = (msg) => setLog(prev => [...prev.slice(-30), msg]);

  const run = useCallback(async () => {
    if (journalsA.length === 0 || journalsB.length === 0) return;
    abortRef.current = new AbortController();
    setPhase("running"); setResults([]); setTotalOverlap(0); setLog([]); setErrorMsg("");
    setProgress({ a: 0, aTotal: 0, b: 0, bTotal: 0, enrich: 0, enrichTotal: 0 });
    setActivePage("dashboard");

    try {
      addLog(`Fetching Set A (${journalsA.length} journal${journalsA.length > 1 ? "s" : ""})...`);
      const mapA = await fetchWorksForSources(journalsA.map(j => j.id), fromYear, ({ phase: p, sourceId, total }) => {
        if (p === "count") { addLog(`  ${sourceId}: ${total.toLocaleString()} articles`); setProgress(prev => ({ ...prev, aTotal: prev.aTotal + total })); }
        else setProgress(prev => ({ ...prev, a: Math.min(prev.a + PER_PAGE, prev.aTotal) }));
      }, abortRef.current.signal);
      addLog(`Set A: ${mapA.size.toLocaleString()} unique authors`);

      addLog(`Fetching Set B (${journalsB.length} journal${journalsB.length > 1 ? "s" : ""})...`);
      const mapB = await fetchWorksForSources(journalsB.map(j => j.id), fromYear, ({ phase: p, sourceId, total }) => {
        if (p === "count") { addLog(`  ${sourceId}: ${total.toLocaleString()} articles`); setProgress(prev => ({ ...prev, bTotal: prev.bTotal + total })); }
        else setProgress(prev => ({ ...prev, b: Math.min(prev.b + PER_PAGE, prev.bTotal) }));
      }, abortRef.current.signal);
      addLog(`Set B: ${mapB.size.toLocaleString()} unique authors`);

      addLog("Computing overlap...");
      const overlap = [];
      for (const [aid, entryA] of mapA) {
        if (mapB.has(aid)) {
          const entryB = mapB.get(aid);
          const articlesInA = [...entryA.works.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
          const articlesInB = [...entryB.works.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
          overlap.push({ id: aid, worksInA: articlesInA.length, worksInB: articlesInB.length, articlesInA, articlesInB, institutions: new Set([...entryA.institutions, ...entryB.institutions]), enriched: null });
        }
      }

      const total = overlap.length;
      setTotalOverlap(total);
      addLog(`Overlap: ${total.toLocaleString()} authors in both sets`);
      if (total === 0) { setPhase("done"); setResults([]); return; }

      const toEnrich = overlap.sort((a, b) => (b.worksInA + b.worksInB) - (a.worksInA + a.worksInB)).slice(0, resultCap);
      addLog(`Enriching top ${toEnrich.length} authors...`);
      setProgress(prev => ({ ...prev, enrichTotal: toEnrich.length }));

      const enriched = {};
      let enrichCount = 0;
      for (const chunk of chunkArray(toEnrich.map(a => a.id), 50)) {
        if (abortRef.current.signal.aborted) throw new Error("Cancelled");
        const sids = chunk.map(id => id.replace("https://openalex.org/", ""));
        try {
          const data = await apiFetch(`${BASE}/authors?filter=openalex_id:${sids.join("|")}&per_page=50&select=id,display_name,orcid,cited_by_count,works_count,last_known_institutions`);
          for (const a of (data.results || [])) enriched[a.id] = a;
        } catch {}
        enrichCount += chunk.length;
        setProgress(prev => ({ ...prev, enrich: enrichCount }));
        await sleep(80);
      }

      const finalResults = toEnrich.map(a => ({ ...a, enriched: enriched[a.id] || null }));
      addLog(`Done. Showing ${finalResults.length} of ${total.toLocaleString()} authors.`);
      setResults(finalResults);
      setPhase("done");
    } catch (e) {
      if (e.message === "Cancelled") { setPhase("idle"); addLog("Cancelled."); }
      else { setErrorMsg(e.message); setPhase("error"); }
    }
  }, [journalsA, journalsB, resultCap, fromYear]);

  const cancel = () => abortRef.current?.abort();
  const canRun = journalsA.length > 0 && journalsB.length > 0 && phase !== "running";
  const isRunning = phase === "running";
  const aProgress = progress.aTotal ? Math.min(1, progress.a / progress.aTotal) : 0;
  const bProgress = progress.bTotal ? Math.min(1, progress.b / progress.bTotal) : 0;
  const enrichProgress = progress.enrichTotal ? Math.min(1, progress.enrich / progress.enrichTotal) : 0;
  const hasResults = results.length > 0;

  const NAV = [
    { key: "dashboard",    label: "Authors" },
    { key: "journals",     label: "Journal Pairs" },
    { key: "institutions", label: "Institutions" },
    { key: "topics",       label: "Topics" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.textPrimary, fontFamily: "'IBM Plex Mono','Fira Code',monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgDark }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.textMuted, marginBottom: 3 }}>OpenAlex · Authorship Analysis</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif" }}>Journal Overlap Finder</div>
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, textAlign: "right", lineHeight: 1.8, letterSpacing: "0.05em" }}>
          Articles {fromYear}–present<br />Powered by OpenAlex
        </div>
      </div>

      {/* Controls */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 28px", background: C.bgDark }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="journal-sets-row" style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
            <JournalSearchBox label="A" color="A" journals={journalsA} setJournals={setJournalsA} disabled={isRunning} />
            <div className="sets-divider" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: C.border2, userSelect: "none", paddingTop: 24 }}>&#8745;</div>
            <JournalSearchBox label="B" color="B" journals={journalsB} setJournals={setJournalsB} disabled={isRunning} />
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={isRunning ? cancel : run} disabled={!isRunning && !canRun} style={{
              padding: "10px 26px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13,
              cursor: canRun || isRunning ? "pointer" : "not-allowed",
              background: isRunning ? "#742a2a" : canRun ? "#2b6cb0" : "#1a1f2e",
              color: canRun || isRunning ? "#fff" : C.textMuted,
              transition: "background 0.2s", letterSpacing: "0.05em",
            }}>
              {isRunning ? "Stop" : "Find Overlap"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.textMuted }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>From</span>
              <select value={fromYear} onChange={e => setFromYear(Number(e.target.value))} disabled={isRunning}
                style={{ background: "#1a1f2e", border: `1px solid ${C.border2}`, borderRadius: 6, padding: "5px 10px", color: C.textPrimary, fontSize: 12, cursor: "pointer", outline: "none" }}>
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.textMuted }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Show top</span>
              <select value={resultCap} onChange={e => setResultCap(Number(e.target.value))} disabled={isRunning}
                style={{ background: "#1a1f2e", border: `1px solid ${C.border2}`, borderRadius: 6, padding: "5px 10px", color: C.textPrimary, fontSize: 12, cursor: "pointer", outline: "none" }}>
                {CAP_OPTIONS.map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>authors</span>
            </div>

            {(journalsA.length > 0 || journalsB.length > 0) && (
              <button onClick={() => { navigator.clipboard.writeText(window.location.href); }} style={{ ...ghostBtn, padding: "5px 14px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Copy Link
              </button>
            )}

            {phase === "done" && hasResults && <div style={{ fontSize: 12, color: C.greenDark }}>Done — {results.length.toLocaleString()} authors · {totalOverlap.toLocaleString()} total overlap</div>}
            {phase === "done" && !hasResults && <div style={{ fontSize: 12, color: C.red }}>No authors found in both sets</div>}
            {phase === "error" && <div style={{ fontSize: 12, color: C.red }}>Error: {errorMsg}</div>}
          </div>

          {/* Progress */}
          {isRunning && (
            <div style={{ background: "#111827", border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", marginTop: 16, animation: "fadeIn 0.3s ease" }}>
              <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
                {[{ label: "Set A", pct: aProgress, color: C.blue }, { label: "Set B", pct: bProgress, color: C.amber }, { label: "Enriching", pct: enrichProgress, color: C.green }].map(({ label, pct, color }) => (
                  <div key={label} style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label} · {Math.round(pct * 100)}%</div>
                    <ProgressBar value={pct * 100} max={100} color={color} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner size={11} color={C.textMuted} />{log[log.length - 1] || "Working..."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab nav */}
      {hasResults && (
        <div style={{ borderBottom: `1px solid ${C.border}`, background: C.bgDark, padding: "0 28px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => setActivePage(key)} style={{
                padding: "12px 20px", border: "none", background: "transparent",
                color: activePage === key ? C.textPrimary : C.textMuted,
                borderBottom: `2px solid ${activePage === key ? C.blue : "transparent"}`,
                cursor: "pointer", fontSize: 12, fontWeight: activePage === key ? 600 : 400,
                transition: "all 0.15s", letterSpacing: "0.04em",
              }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Page content */}
      {activePage === "dashboard" && !hasResults && !isRunning && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "48px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.15 }}>&#8898;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 8 }}>
            Find authors who publish across journal communities
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7, marginBottom: 28 }}>
            Add journals to <span style={{ color: C.blueLight }}>Set A</span> and <span style={{ color: C.amberLight }}>Set B</span> above, then click <strong style={{ color: C.textSecondary }}>Find Overlap</strong> to discover researchers who bridge both sets.
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.8, textAlign: "left", display: "inline-block" }}>
            <div style={{ fontWeight: 600, color: C.textSecondary, marginBottom: 6, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.12em" }}>Try an example</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { a: "Nature", b: "Science", desc: "Nature vs Science" },
                { a: "The Lancet", b: "New England Journal of Medicine", desc: "Lancet vs NEJM" },
                { a: "Cell", b: "Nature Biotechnology", desc: "Cell vs Nature Biotech" },
              ].map(({ a, b, desc }) => (
                <button key={desc} onClick={async () => {
                  const { resolved: rA } = await resolveJournalNames([a]);
                  const { resolved: rB } = await resolveJournalNames([b]);
                  if (rA.length) setJournalsA(rA);
                  if (rB.length) setJournalsB(rB);
                }} style={{ ...ghostBtn, textAlign: "left", padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: C.blueLight }}>{a}</span>
                  <span style={{ color: C.textMuted }}>vs</span>
                  <span style={{ color: C.amberLight }}>{b}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {activePage === "dashboard" && (hasResults || isRunning) && (
        <DashboardPage results={results} totalOverlap={totalOverlap} sortKey={sortKey} setSortKey={setSortKey} journalsA={journalsA} journalsB={journalsB} fromYear={fromYear} />
      )}
      {activePage === "journals" && hasResults && (
        <JournalPairsPage results={results} journalsA={journalsA} journalsB={journalsB} />
      )}
      {activePage === "institutions" && hasResults && (
        <InstitutionPage results={results} />
      )}
      {activePage === "topics" && hasResults && (
        <TopicsPage results={results} journalsA={journalsA} journalsB={journalsB} />
      )}
      {!hasResults && activePage !== "dashboard" && (
        <div style={{ padding: "48px 28px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
          Run a search first to see this analysis.
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${C.border}`, marginTop: 48,
        padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
        fontSize: 11, color: C.textMuted,
        background: C.bgDark,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>
            Created by{" "}
            <a href="https://github.com/teowaits" target="_blank" rel="noreferrer"
              style={{ color: C.blueLight, textDecoration: "none", fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
              onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
            >teowaits</a>
          </span>
          <span style={{ color: C.border2 }}>·</span>
          <span>
            Data from{" "}
            <a href="https://openalex.org" target="_blank" rel="noreferrer"
              style={{ color: C.textSecondary, textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = C.textPrimary}
              onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
            >OpenAlex API</a>
            {" "}-- open scholarly metadata under{" "}
            <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer"
              style={{ color: C.textSecondary, textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = C.textPrimary}
              onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
            >CC0</a>
          </span>
        </div>
        <div>
          <a href="https://github.com/teowaits/journal-overlap" target="_blank" rel="noreferrer"
            style={{ color: C.textMuted, textDecoration: "none" }}
            onMouseEnter={e => e.currentTarget.style.color = C.textPrimary}
            onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
          >MIT License</a>
        </div>
      </div>
    </div>
  );
}
