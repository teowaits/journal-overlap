import { ghostBtn } from "./constants.js";

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const chunkArray = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const shortId = id => id?.replace("https://openalex.org/", "") || id;

export function parsePastedNames(text) {
  return text.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length > 1);
}

function escapeCsv(val) {
  if (val == null) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, headers, rows) {
  const csv = [headers.map(escapeCsv).join(","), ...rows.map(r => r.map(escapeCsv).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function computeJournalPairs(results) {
  const pairMap = new Map();
  for (const author of results) {
    const journalsA = [...new Set(author.articlesInA.map(a => a.journal).filter(Boolean))];
    const journalsB = [...new Set(author.articlesInB.map(a => a.journal).filter(Boolean))];
    for (const ja of journalsA) {
      for (const jb of journalsB) {
        const key = `${ja}|||${jb}`;
        if (!pairMap.has(key)) pairMap.set(key, { journalA: ja, journalB: jb, authors: 0, worksA: 0, worksB: 0 });
        const p = pairMap.get(key);
        p.authors++;
        p.worksA += author.articlesInA.filter(a => a.journal === ja).length;
        p.worksB += author.articlesInB.filter(a => a.journal === jb).length;
      }
    }
  }
  return [...pairMap.values()].sort((a, b) => b.authors - a.authors);
}

export function computeInstitutionOverlap(results) {
  const instMap = new Map();
  for (const author of results) {
    const overlap = author.worksInA + author.worksInB;
    const citations = author.enriched?.cited_by_count || 0;
    const insts = author.enriched?.last_known_institutions?.map(i => i.display_name).filter(Boolean)
      || [...author.institutions];
    const seen = new Set();
    for (const inst of insts) {
      if (!inst || seen.has(inst)) continue;
      seen.add(inst);
      if (!instMap.has(inst)) instMap.set(inst, { name: inst, authors: 0, totalOverlap: 0, totalCitations: 0 });
      const e = instMap.get(inst);
      e.authors++;
      e.totalOverlap += overlap;
      e.totalCitations += citations;
    }
  }
  return [...instMap.values()].sort((a, b) => b.authors - a.authors);
}

export function computeTopicOverlap(results) {
  const levels = ["topic", "subfield", "field", "domain"];
  const maps = Object.fromEntries(levels.map(l => [l, new Map()]));

  for (const author of results) {
    for (const level of levels) {
      const seenA = new Map();
      const seenB = new Map();
      for (const art of author.articlesInA) {
        const e = art[level]; if (e) seenA.set(e.id, e.name);
      }
      for (const art of author.articlesInB) {
        const e = art[level]; if (e) seenB.set(e.id, e.name);
      }
      const worksAByEntity = new Map();
      const worksBByEntity = new Map();
      for (const art of author.articlesInA) {
        const e = art[level]; if (!e) continue;
        worksAByEntity.set(e.id, (worksAByEntity.get(e.id) || 0) + 1);
      }
      for (const art of author.articlesInB) {
        const e = art[level]; if (!e) continue;
        worksBByEntity.set(e.id, (worksBByEntity.get(e.id) || 0) + 1);
      }
      const allIds = new Set([...seenA.keys(), ...seenB.keys()]);
      for (const eid of allIds) {
        const name = seenA.get(eid) || seenB.get(eid);
        if (!maps[level].has(eid)) {
          maps[level].set(eid, { id: eid, name, level, authorsA: 0, authorsB: 0, authorsOverlap: 0, worksA: 0, worksB: 0 });
        }
        const e = maps[level].get(eid);
        if (seenA.has(eid)) { e.authorsA++; e.worksA += worksAByEntity.get(eid) || 0; }
        if (seenB.has(eid)) { e.authorsB++; e.worksB += worksBByEntity.get(eid) || 0; }
        if (seenA.has(eid) && seenB.has(eid)) e.authorsOverlap++;
      }
    }
  }
  return Object.fromEntries(
    levels.map(l => [l, [...maps[l].values()].sort((a, b) => b.authorsOverlap - a.authorsOverlap)])
  );
}
