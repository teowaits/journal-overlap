import { useMemo } from "react";
import { C } from "../constants.js";
import { shortId } from "../utils.js";

export default function WordCloud({ results }) {
  const words = useMemo(() => {
    const top100 = [...results]
      .sort((a, b) => (b.worksInA + b.worksInB) - (a.worksInA + a.worksInB))
      .slice(0, 100);
    if (!top100.length) return [];
    const maxScore = top100[0].worksInA + top100[0].worksInB;
    const minScore = top100[top100.length - 1].worksInA + top100[top100.length - 1].worksInB;
    return top100.map(a => {
      const score = a.worksInA + a.worksInB;
      const norm = minScore === maxScore ? 1 : (score - minScore) / (maxScore - minScore);
      const size = Math.round(11 + norm * 26);
      const ratio = (a.worksInA) / (score || 1);
      const color = ratio > 0.6 ? C.blueLight : ratio < 0.4 ? C.amberLight : C.green;
      return { name: a.enriched?.display_name || shortId(a.id), score, size, color, id: a.id };
    }).sort(() => Math.random() - 0.5);
  }, [results]);

  if (!words.length) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Top 100 Overlapping Authors</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 16 }}>
        Size = overlap score · <span style={{ color: C.blueLight }}>■</span> Set A dominant · <span style={{ color: C.green }}>■</span> Balanced · <span style={{ color: C.amberLight }}>■</span> Set B dominant
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "6px 10px",
        alignItems: "center", lineHeight: 1.5,
      }}>
        {words.map(w => (
          <a key={w.id} href={w.id} target="_blank" rel="noreferrer" style={{
            fontSize: w.size, color: w.color, textDecoration: "none",
            opacity: 0.85, transition: "opacity 0.15s, transform 0.15s",
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: w.size > 24 ? 700 : w.size > 16 ? 500 : 400,
            display: "inline-block",
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "scale(1)"; }}
            title={`${w.name} · overlap score: ${w.score}`}
          >
            {w.name}
          </a>
        ))}
      </div>
    </div>
  );
}
