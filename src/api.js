import { BASE, PER_PAGE } from "./constants.js";
import { sleep } from "./utils.js";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000];

export async function apiFetch(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAYS[attempt];
      await sleep(delay);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${txt.slice(0, 120)}`);
  }
}

export async function searchSources(query) {
  const data = await apiFetch(
    `${BASE}/sources?search=${encodeURIComponent(query)}&per_page=8` +
    `&select=id,display_name,issn_l,works_count,type,host_organization_name`
  );
  return data.results || [];
}

export async function resolveJournalNames(names) {
  const resolved = [], failed = [];
  for (const name of names) {
    const q = name.trim();
    if (!q) continue;
    try {
      const results = await searchSources(q);
      if (results.length > 0) resolved.push({ ...results[0], _query: q });
      else failed.push(q);
    } catch { failed.push(q); }
    await sleep(120);
  }
  return { resolved, failed };
}

async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function processWorks(works, authorMap) {
  for (const work of works) {
    const journal = work.primary_location?.source?.display_name || null;
    const pt = work.primary_topic || null;
    const articleMeta = {
      id: work.id, title: work.title || null, doi: work.doi || null,
      journal, year: work.publication_year || null,
      topic:    pt ? { id: pt.id, name: pt.display_name } : null,
      subfield: pt?.subfield ? { id: pt.subfield.id, name: pt.subfield.display_name } : null,
      field:    pt?.field    ? { id: pt.field.id,    name: pt.field.display_name }    : null,
      domain:   pt?.domain   ? { id: pt.domain.id,   name: pt.domain.display_name }   : null,
    };
    for (const authorship of (work.authorships || [])) {
      const aid = authorship.author?.id;
      if (!aid) continue;
      if (!authorMap.has(aid)) authorMap.set(aid, { id: aid, works: new Map(), institutions: new Set() });
      const entry = authorMap.get(aid);
      entry.works.set(work.id, articleMeta);
      for (const inst of (authorship.institutions || [])) {
        if (inst.display_name) entry.institutions.add(inst.display_name);
      }
    }
  }
}

export async function fetchWorksForSources(sourceIds, fromYear, onProgress, signal) {
  const authorMap = new Map();
  const CONCURRENCY = 4;

  for (const sourceId of sourceIds) {
    if (signal?.aborted) throw new Error("Cancelled");
    const sid = sourceId.replace("https://openalex.org/", "");
    const meta = await apiFetch(
      `${BASE}/works?filter=primary_location.source.id:${sid}` +
      `,from_publication_date:${fromYear}-01-01,type:article&per_page=1&select=id`
    );
    const total = meta.meta?.count || 0;
    onProgress?.({ phase: "count", sourceId: sid, total });
    if (total === 0) continue;
    const pages = Math.min(Math.ceil(total / PER_PAGE), 50);

    const pageTasks = Array.from({ length: pages }, (_, i) => () => {
      if (signal?.aborted) throw new Error("Cancelled");
      return apiFetch(
        `${BASE}/works?filter=primary_location.source.id:${sid}` +
        `,from_publication_date:${fromYear}-01-01,type:article` +
        `&per_page=${PER_PAGE}&page=${i + 1}` +
        `&select=id,title,doi,authorships,publication_year,primary_location,primary_topic`
      ).then(data => {
        const works = data.results || [];
        processWorks(works, authorMap);
        onProgress?.({ phase: "works", sourceId: sid, page: i + 1, pages, total });
        return works.length;
      });
    });

    await runPool(pageTasks, CONCURRENCY);
  }
  return authorMap;
}
