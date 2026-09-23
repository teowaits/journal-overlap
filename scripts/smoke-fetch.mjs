/**
 * Smoke test for step-1 OpenAlex engine. Not part of the app bundle.
 * Usage: OPENALEX_API_KEY=... node scripts/smoke-fetch.mjs
 * Or reads VITE_OPENALEX_API_KEY from ../gem_finder/.env.local
 */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { createRequire } from "module";

// Load api.js with a stub sessionStorage (Node has none)
globalThis.sessionStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

function loadKey() {
  if (process.env.OPENALEX_API_KEY) return process.env.OPENALEX_API_KEY.trim();
  try {
    const env = readFileSync(
      new URL("../../gem_finder/.env.local", import.meta.url),
      "utf8"
    );
    const m = env.match(/^VITE_OPENALEX_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
  return "";
}

const key = loadKey();
if (!key) {
  console.error("No API key — set OPENALEX_API_KEY or gem_finder/.env.local");
  process.exit(1);
}

const api = await import("../src/api.js");
const { PER_PAGE } = await import("../src/constants.js");

api.setApiKey(key);
console.log("key loaded, length=", key.length);
console.log("PER_PAGE=", PER_PAGE);

// ── 1. Header parse vs live response ─────────────────────────────────────────
console.log("\n=== (b) Live X-RateLimit-* headers ===");
const probeUrl =
  "https://api.openalex.org/works?filter=primary_location.source.id:S137773608" +
  ",from_publication_date:2025-01-01,type:article&per_page=1&select=id";
const probeRes = await fetch(
  probeUrl + `&api_key=${encodeURIComponent(key)}`
);
const headerDump = {};
for (const [k, v] of probeRes.headers) {
  if (/ratelimit|retry-after/i.test(k)) headerDump[k] = v;
}
console.log("raw headers:", headerDump);
const parsed = api.trackUsage(probeRes.headers);
console.log("trackUsage parsed:", parsed);
await probeRes.json();

const budget = await api.checkRemainingBudget(key);
console.log("checkRemainingBudget:", {
  dailyBudgetUsd: budget.dailyBudgetUsd,
  dailyUsedUsd: budget.dailyUsedUsd,
  dailyRemainingUsd: budget.dailyRemainingUsd,
});

// ── 2. 429 classification (simulated) ────────────────────────────────────────
console.log("\n=== (1) Simulated 429 classification ===");
function fakeHeaders(obj) {
  return new Headers(obj);
}
const transient = fakeHeaders({
  "Retry-After": "2",
  "X-RateLimit-Remaining": "5000",
  "X-RateLimit-Reset": "2",
});
const spent = fakeHeaders({
  "X-RateLimit-Remaining-USD": "0",
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Reset": "43200",
});
const spentUsage = api.trackUsage(spent);
console.log(
  "transient throttle?",
  api.isBudgetExhausted429(transient, api.trackUsage(transient)),
  "(expect false)"
);
console.log(
  "spent budget (USD<=0)?",
  api.isBudgetExhausted429(spent, spentUsage),
  "(expect true)"
);
// Large Retry-After alone must NOT classify as spent
const bigRetry = fakeHeaders({
  "Retry-After": "40000",
  "X-RateLimit-Remaining-USD": "0.5",
  "X-RateLimit-Remaining": "5000",
});
console.log(
  "large Retry-After alone?",
  api.isBudgetExhausted429(bigRetry, api.trackUsage(bigRetry)),
  "(expect false)"
);

// Mock fetch for budget-exhausted path — no real retries toward midnight
const realFetch = globalThis.fetch;
let mockCalls = 0;
globalThis.fetch = async () => {
  mockCalls++;
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: {
      "Retry-After": "40000",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Remaining-USD": "0",
      "X-RateLimit-Limit": "10000",
      "X-RateLimit-Credits-Used": "0",
      "X-RateLimit-Reset": "40000",
      "Content-Type": "application/json",
    },
  });
};
try {
  await api.apiFetch("https://api.openalex.org/works?filter=id:W1");
  console.log("FAIL: expected OpenAlexBudgetError");
} catch (e) {
  console.log(
    "budget 429 →",
    e.name,
    "| retries attempted:",
    mockCalls,
    "| msg:",
    e.message.slice(0, 100)
  );
  console.log("expect OpenAlexBudgetError + exactly 1 call:", e.name === "OpenAlexBudgetError" && mockCalls === 1);
}
globalThis.fetch = realFetch;

// Transient 429 then success — should retry once
mockCalls = 0;
let transientPass = 0;
globalThis.fetch = async () => {
  mockCalls++;
  if (mockCalls === 1) {
    return new Response("slow down", {
      status: 429,
      headers: {
        "Retry-After": "1",
        "X-RateLimit-Remaining": "9000",
        "X-RateLimit-Reset": "1",
      },
    });
  }
  transientPass++;
  return new Response(JSON.stringify({ results: [], meta: {} }), {
    status: 200,
    headers: {
      "X-RateLimit-Remaining": "8999",
      "X-RateLimit-Limit": "10000",
      "X-RateLimit-Credits-Used": "1",
      "X-RateLimit-Reset": "10000",
      "Content-Type": "application/json",
    },
  });
};
const t0 = Date.now();
await api.apiFetch("https://api.openalex.org/works?filter=id:W1");
console.log(
  "transient 429 → success after",
  mockCalls,
  "calls,",
  Date.now() - t0,
  "ms (expect 2 calls, ~1s sleep)"
);
globalThis.fetch = realFetch;

// ── 3. Pick small journals ───────────────────────────────────────────────────
console.log("\n=== Resolve small journals ===");
// Prefer niche venues likely to have a few hundred type:article since 2024
const candidates = [
  "Journal of Open Source Software",
  "Wellcome Open Research",
  "F1000Research",
  "PeerJ Computer Science",
];
const resolved = [];
for (const name of candidates) {
  const hits = await api.searchSources(name, { apiKey: key });
  const top = hits[0];
  if (!top) continue;
  const sid = top.id.replace("https://openalex.org/", "");
  const meta = await api.apiFetch(
    `https://api.openalex.org/works?filter=primary_location.source.id:${sid}` +
      `,from_publication_date:2024-01-01,type:article&per_page=1&select=id`,
    { apiKey: key }
  );
  const count = meta.meta?.count || 0;
  console.log(`  ${top.display_name}: ${sid} works_count=${top.works_count} since2024(article)=${count}`);
  resolved.push({ ...top, sid, count2024: count });
}

const pair = resolved
  .filter((j) => j.count2024 >= 50 && j.count2024 <= 800)
  .slice(0, 2);
if (pair.length < 2) {
  // fall back to two smallest among resolved
  pair.length = 0;
  pair.push(...[...resolved].sort((a, b) => a.count2024 - b.count2024).slice(0, 2));
}
console.log(
  "Using pair:",
  pair.map((j) => `${j.display_name} (${j.count2024})`).join(" | ")
);

const ids = pair.map((j) => j.id);
const fromYear = 2024;

// ── Legacy page-based fetch (pre-cursor) for comparison ──────────────────────
async function legacyFetchWorksForSources(sourceIds, fromYear, { apiKey, concurrency = 4 } = {}) {
  const authorMap = new Map();
  const processWorks = (works) => {
    for (const work of works) {
      for (const authorship of work.authorships || []) {
        const aid = authorship.author?.id;
        if (!aid) continue;
        if (!authorMap.has(aid)) authorMap.set(aid, { works: new Set() });
        authorMap.get(aid).works.add(work.id);
      }
    }
  };
  async function one(sourceId) {
    const sid = sourceId.replace("https://openalex.org/", "");
    const filter =
      `primary_location.source.id:${sid},from_publication_date:${fromYear}-01-01,type:article`;
    const meta = await api.apiFetch(
      `https://api.openalex.org/works?filter=${filter}&per_page=1&select=id`,
      { apiKey }
    );
    const total = meta.meta?.count || 0;
    const pages = Math.min(Math.ceil(total / PER_PAGE), 50);
    for (let i = 1; i <= pages; i++) {
      const data = await api.apiFetch(
        `https://api.openalex.org/works?filter=${filter}` +
          `&per_page=${PER_PAGE}&page=${i}` +
          `&select=id,authorships`,
        { apiKey }
      );
      processWorks(data.results || []);
    }
    return total;
  }
  // sequential for fair apples-to-apples author-set compare timing aside
  const totals = {};
  for (const id of sourceIds) {
    const sid = id.replace("https://openalex.org/", "");
    totals[sid] = await one(id);
  }
  return { authorMap, totals };
}

console.log("\n=== (a) Cursor vs legacy page pagination ===");
const cursorEvents = [];
const tCursor = Date.now();
const cursorMap = await api.fetchWorksForSources(ids, fromYear, {
  apiKey: key,
  concurrency: 1, // serial sources for deterministic compare first
  onProgress: (e) => {
    if (e.phase === "count") cursorEvents.push({ ...e, t: Date.now() - tCursor });
    if (e.phase === "works" && e.page === 1)
      cursorEvents.push({ phase: "firstPage", sourceId: e.sourceId, t: Date.now() - tCursor });
    if (e.phase === "works" && e.fetched >= e.total)
      cursorEvents.push({ phase: "done", sourceId: e.sourceId, fetched: e.fetched, total: e.total, t: Date.now() - tCursor });
  },
});
const cursorMs = Date.now() - tCursor;
console.log("cursor events:", cursorEvents);
console.log(`cursor: ${cursorMap.size} authors in ${cursorMs}ms`);

const tLegacy = Date.now();
const { authorMap: legacyMap, totals: legacyTotals } = await legacyFetchWorksForSources(ids, fromYear, {
  apiKey: key,
});
const legacyMs = Date.now() - tLegacy;
console.log(`legacy: ${legacyMap.size} authors in ${legacyMs}ms; totals`, legacyTotals);

const cursorIds = [...cursorMap.keys()].sort();
const legacyIds = [...legacyMap.keys()].sort();
const onlyCursor = cursorIds.filter((id) => !legacyMap.has(id));
const onlyLegacy = legacyIds.filter((id) => !cursorMap.has(id));
console.log("author set equal?", onlyCursor.length === 0 && onlyLegacy.length === 0);
console.log("only in cursor:", onlyCursor.length, "only in legacy:", onlyLegacy.length);
if (onlyCursor.length || onlyLegacy.length) {
  console.log("  sample onlyCursor", onlyCursor.slice(0, 3));
  console.log("  sample onlyLegacy", onlyLegacy.slice(0, 3));
}

// Per-source work counts from cursor progress
for (const e of cursorEvents.filter((x) => x.phase === "done")) {
  const match = e.fetched === e.total;
  console.log(
    `  source ${e.sourceId}: fetched ${e.fetched} / meta.count ${e.total} terminate_ok=${match}`
  );
}

// ── 4. Minimal select ────────────────────────────────────────────────────────
console.log("\n=== (c) fetchAuthorIdsForSources minimal select ===");
const oneId = [ids[0]];
const sid0 = pair[0].sid;
const tMin = Date.now();
const idSet = await api.fetchAuthorIdsForSources(oneId, fromYear, {
  apiKey: key,
  concurrency: 1,
});
console.log(
  `minimal Set size=${idSet.size} in ${Date.now() - tMin}ms; full-map authors for same source would be subset of combined`
);
// Compare to cursor map filtered to authors who have works only from this journal is hard;
// instead compare to a dedicated full fetch of one source
const oneFull = await api.fetchWorksForSources(oneId, fromYear, { apiKey: key, concurrency: 1 });
console.log(
  `full select authors=${oneFull.size}; minimal=${idSet.size}; equal=${oneFull.size === idSet.size}`
);
const minOnly = [...idSet].filter((id) => !oneFull.has(id));
const fullOnly = [...oneFull.keys()].filter((id) => !idSet.has(id));
console.log("set diff minimal-only", minOnly.length, "full-only", fullOnly.length);

// works_count on source is career-total all types; our filter is type:article + year —
// report expected article count from earlier meta vs unique authors (authors << works)
console.log(
  `source works_count(all-time all-types)=${pair[0].works_count}; ` +
    `articles since ${fromYear}=${pair[0].count2024}; unique authors (minimal)=${idSet.size}`
);

// ── 5. Concurrency across sources ────────────────────────────────────────────
console.log("\n=== Concurrency: sources still parallel? ===");
const timeline = [];
const tPar = Date.now();
await api.fetchWorksForSources(ids, fromYear, {
  apiKey: key,
  concurrency: 4,
  onProgress: (e) => {
    if (e.phase === "count" || (e.phase === "works" && e.page === 1)) {
      timeline.push({
        t: Date.now() - tPar,
        phase: e.phase,
        sourceId: e.sourceId,
        page: e.page,
      });
    }
  },
});
console.log("timeline (count + first page per source):");
for (const row of timeline) console.log(" ", row);
const counts = timeline.filter((r) => r.phase === "count");
if (counts.length >= 2) {
  const gap = Math.abs(counts[0].t - counts[1].t);
  console.log(
    `count-phase start gap between sources: ${gap}ms (<< sequential sum ⇒ parallel; sequential would be hundreds–thousands ms apart)`
  );
}

console.log("\n=== last usage after real calls ===");
console.log(api.getLastUsage());
console.log("\nDONE");
