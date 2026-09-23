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

/**
 * Authors in Set A who do not appear in Set B's author-ID set.
 * Result shape matches overlap authors so enrichment / ranking stay shared:
 * worksInB is always 0; articlesInB is always [].
 *
 * @param {Map<string, { id: string, works: Map, institutions: Set }>} mapA
 * @param {Set<string>} authorIdsInB
 */
export function computeExclusiveAuthors(mapA, authorIdsInB) {
  const exclusive = [];
  for (const [aid, entryA] of mapA) {
    if (authorIdsInB.has(aid)) continue;
    const articlesInA = [...entryA.works.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
    exclusive.push({
      id: aid,
      worksInA: articlesInA.length,
      worksInB: 0,
      articlesInA,
      articlesInB: [],
      institutions: new Set(entryA.institutions),
      enriched: null,
    });
  }
  return exclusive;
}

/**
 * Overlap authors present in both maps. Same result shape as computeExclusiveAuthors.
 */
export function computeOverlapAuthors(mapA, mapB) {
  const overlap = [];
  for (const [aid, entryA] of mapA) {
    if (!mapB.has(aid)) continue;
    const entryB = mapB.get(aid);
    const articlesInA = [...entryA.works.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
    const articlesInB = [...entryB.works.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
    overlap.push({
      id: aid,
      worksInA: articlesInA.length,
      worksInB: articlesInB.length,
      articlesInA,
      articlesInB,
      institutions: new Set([...entryA.institutions, ...entryB.institutions]),
      enriched: null,
    });
  }
  return overlap;
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

/**
 * Single-axis Set A journal breakdown for exclusive mode.
 * Reuses the per-journal author counting from computeJournalPairs (A side only).
 * @param {object[]} results — exclusive authors with articlesInA
 * @param {{ id: string, display_name: string }[]} [journalsA] — optional, attaches sourceId when names match
 */
export function computeContributingJournals(results, journalsA = []) {
  const idByName = new Map(
    journalsA.map(j => [j.display_name, j.id?.replace("https://openalex.org/", "") || j.id])
  );
  const map = new Map();
  for (const author of results) {
    const journals = [...new Set(author.articlesInA.map(a => a.journal).filter(Boolean))];
    for (const name of journals) {
      if (!map.has(name)) {
        map.set(name, {
          sourceId: idByName.get(name) || null,
          sourceName: name,
          exclusiveAuthorCount: 0,
          worksA: 0,
        });
      }
      const e = map.get(name);
      e.exclusiveAuthorCount++;
      e.worksA += author.articlesInA.filter(a => a.journal === name).length;
    }
  }
  return [...map.values()].sort((a, b) => b.exclusiveAuthorCount - a.exclusiveAuthorCount);
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

/**
 * Exclusive-mode Topics: A-only counts from exclusive authors' Set A articles.
 * No B-side works required (unlike computeTopicOverlap).
 */
export function computeTopicsExclusive(results) {
  const levels = ["topic", "subfield", "field", "domain"];
  const maps = Object.fromEntries(levels.map(l => [l, new Map()]));

  for (const author of results) {
    for (const level of levels) {
      const seen = new Map();
      const worksBy = new Map();
      for (const art of author.articlesInA || []) {
        const e = art[level];
        if (!e) continue;
        seen.set(e.id, e.name);
        worksBy.set(e.id, (worksBy.get(e.id) || 0) + 1);
      }
      for (const [eid, name] of seen) {
        if (!maps[level].has(eid)) {
          maps[level].set(eid, { id: eid, name, level, authorCount: 0, worksA: 0 });
        }
        const e = maps[level].get(eid);
        e.authorCount++;
        e.worksA += worksBy.get(eid) || 0;
      }
    }
  }
  return Object.fromEntries(
    levels.map(l => [l, [...maps[l].values()].sort((a, b) => b.authorCount - a.authorCount)])
  );
}

/**
 * Relative topic/subfield gaps: meaningfully present in A, proportionally scarce in B.
 * Not raw-zero-in-B — B is usually a larger corpus.
 *
 * Thresholds:
 * - A: count >= 5 OR share >= 1% of A's works
 * - Gap: B's share ≤ 25% of A's share (includes absent)
 */
export function computeRelativeTopicGaps(histA, histB, {
  minCountA = 5,
  minShareA = 0.01,
  maxBShareOfA = 0.25,
} = {}) {
  const totalA = histA.totalWorks || [...histA.groups.values()].reduce((s, g) => s + g.count, 0);
  const totalB = histB.totalWorks || [...histB.groups.values()].reduce((s, g) => s + g.count, 0);
  if (!totalA) return [];

  const gaps = [];
  for (const [id, a] of histA.groups) {
    const shareA = a.count / totalA;
    // Keep if meaningfully present in A (count OR share threshold)
    if (a.count < minCountA && shareA < minShareA) continue;

    const b = histB.groups.get(id);
    const countB = b?.count || 0;
    const shareB = totalB > 0 ? countB / totalB : 0;
    if (shareB > shareA * maxBShareOfA) continue;

    const enrichment = shareB > 0 ? shareA / shareB : Infinity;
    gaps.push({
      id,
      name: a.name,
      countA: a.count,
      countB,
      shareA,
      shareB,
      enrichment,
      gapScore: shareA - shareB,
    });
  }

  return gaps.sort((a, b) => {
    if (a.enrichment === Infinity && b.enrichment !== Infinity) return -1;
    if (b.enrichment === Infinity && a.enrichment !== Infinity) return 1;
    if (a.enrichment !== b.enrichment) return b.enrichment - a.enrichment;
    return b.gapScore - a.gapScore;
  });
}
