import { BASE, PER_PAGE_PREFERRED, PER_PAGE_SAFE } from "./constants.js";
import { sleep } from "./utils.js";

import {
  buildSetBCacheKey,
  readSetBCache,
  writeSetBCache,
} from "./setBCache.js";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000];
/** Same key name pattern as gem_finder; this app uses localStorage (not sessionStorage). */
const API_KEY_STORAGE = "openalex_api_key";

/** Fallback list-call cost when /rate-limit hasn't been consulted yet ($/call). */
const DEFAULT_LIST_COST_USD = 0.0001;
/**
 * Require explicit confirmation for all-time Set B when estimated cost is at least
 * this fraction of remaining daily budget (or exceeds remaining entirely).
 */
const PREFLIGHT_CONFIRM_FRACTION = 0.1;
const PREFLIGHT_CONFIRM_MIN_USD = 0.05;

const FULL_WORKS_SELECT =
  "id,title,doi,authorships,publication_year,primary_location,primary_topic";
/** Set B exclusive path: author IDs only — no titles/topics/institutions. */
const MINIMAL_WORKS_SELECT = "authorships";

/** Runtime works page size — starts at 200, may fall back to 100 on a per_page 400. */
let worksPerPage = PER_PAGE_PREFERRED;

export function getWorksPerPage() {
  return worksPerPage;
}

function downgradeWorksPerPage(reason) {
  if (worksPerPage <= PER_PAGE_SAFE) return false;
  worksPerPage = PER_PAGE_SAFE;
  console.warn(`[openalex] Downgraded works per_page to ${PER_PAGE_SAFE}: ${reason}`);
  return true;
}

let lastUsage = null;
let usageListener = null;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* private mode / blocked */ }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function getApiKey() {
  try {
    let key = localStorage.getItem(API_KEY_STORAGE) || "";
    // One-time migrate from earlier sessionStorage experiments
    if (!key) {
      try {
        const legacy = sessionStorage.getItem(API_KEY_STORAGE);
        if (legacy) {
          localStorage.setItem(API_KEY_STORAGE, legacy);
          sessionStorage.removeItem(API_KEY_STORAGE);
          key = legacy;
        }
      } catch { /* ignore */ }
    }
    return key;
  } catch {
    return "";
  }
}

export function setApiKey(key) {
  const trimmed = (key || "").trim();
  if (trimmed) storageSet(API_KEY_STORAGE, trimmed);
  else storageRemove(API_KEY_STORAGE);
  // Clear any leftover sessionStorage copy
  try { sessionStorage.removeItem(API_KEY_STORAGE); } catch { /* ignore */ }
}

/** Clear persisted API key (Forget key). */
export function clearApiKey() {
  setApiKey("");
}

export function getLastUsage() {
  return lastUsage;
}

/** Subscribe to usage updates from every apiFetch response (ok or error). Returns unsubscribe. */
export function onUsageUpdate(fn) {
  usageListener = fn;
  return () => {
    if (usageListener === fn) usageListener = null;
  };
}

/**
 * Parse OpenAlex X-RateLimit-* response headers.
 * Call on success and error — remaining budget matters most on 429s.
 * CORS exposes these (confirmed live); credit + USD fields are both present.
 */
export function trackUsage(headers) {
  const num = (name) => {
    const v = headers.get(name);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const usage = {
    limit: num("X-RateLimit-Limit"),
    remaining: num("X-RateLimit-Remaining"),
    creditsUsed: num("X-RateLimit-Credits-Used"),
    resetSeconds: num("X-RateLimit-Reset"),
    limitUsd: num("X-RateLimit-Limit-USD"),
    remainingUsd: num("X-RateLimit-Remaining-USD"),
    costUsd: num("X-RateLimit-Cost-USD"),
  };
  lastUsage = usage;
  usageListener?.(usage);
  return usage;
}

/** Thrown when a 429 indicates the daily credit budget is exhausted (not a short throttle). */
export class OpenAlexBudgetError extends Error {
  /**
   * @param {string} message
   * @param {{ usage: object, retryAfterSeconds: number|null }} detail
   */
  constructor(message, { usage, retryAfterSeconds } = {}) {
    super(message);
    this.name = "OpenAlexBudgetError";
    this.usage = usage || null;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

function parseRetryAfterSeconds(headers) {
  const raw = headers.get("retry-after");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when a 429 is a spent daily budget rather than a transient throttle.
 * Prefer X-RateLimit-Remaining-USD (live header); fall back to credit Remaining === 0.
 */
export function isBudgetExhausted429(_headers, usage) {
  if (usage?.remainingUsd != null && usage.remainingUsd <= 0) return true;
  if (usage?.remainingUsd == null && usage?.remaining === 0) return true;
  return false;
}

function withApiKey(url, apiKey) {
  const key = apiKey ?? getApiKey();
  if (!key) return url;
  const u = new URL(url, BASE);
  if (!u.searchParams.has("api_key")) u.searchParams.set("api_key", key);
  return u.toString();
}

/**
 * All OpenAlex HTTP goes through here so api_key + usage headers stay consistent.
 * Defensive: if a 400 is tied to per_page=200, permanently fall back to 100 and retry once.
 * @param {string} url
 * @param {{ signal?: AbortSignal, apiKey?: string }} [opts]
 */
export async function apiFetch(url, opts = {}) {
  const { signal, apiKey } = opts;
  let finalUrl = withApiKey(url, apiKey);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(finalUrl, signal ? { signal } : undefined);
    const usage = trackUsage(res.headers);

    if (res.ok) return res.json();

    if (res.status === 429) {
      const retryAfter = parseRetryAfterSeconds(res.headers);
      if (isBudgetExhausted429(res.headers, usage)) {
        const resetHint =
          retryAfter != null
            ? `Resets in ~${Math.ceil(retryAfter / 3600)}h (${retryAfter}s).`
            : usage?.resetSeconds != null
              ? `Resets in ~${Math.ceil(usage.resetSeconds / 3600)}h.`
              : "Wait until the daily budget resets (midnight UTC).";
        const txt = await res.text().catch(() => "");
        throw new OpenAlexBudgetError(
          `OpenAlex daily budget exhausted. ${resetHint}${txt ? ` ${txt.slice(0, 80)}` : ""}`,
          { usage, retryAfterSeconds: retryAfter }
        );
      }
      if (attempt < MAX_RETRIES) {
        const delay = retryAfter != null ? retryAfter * 1000 : RETRY_DELAYS[attempt];
        await sleep(delay);
        continue;
      }
    }

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }

    const txt = await res.text().catch(() => "");

    // Undocumented per_page=200 may be rejected — fall back to documented 100 and retry once.
    if (
      res.status === 400 &&
      worksPerPage > PER_PAGE_SAFE &&
      /per_page=200\b/.test(finalUrl) &&
      (/per_page/i.test(txt) || /invalid/i.test(txt) || txt.length < 200)
    ) {
      if (downgradeWorksPerPage(txt.slice(0, 80) || "HTTP 400 on per_page=200")) {
        finalUrl = finalUrl.replace(/([?&]per_page=)200\b/, `$1${PER_PAGE_SAFE}`);
        continue;
      }
    }

    throw new Error(`API ${res.status}: ${txt.slice(0, 120)}`);
  }
}

/**
 * Prefetch daily budget before a large all-time Set B run.
 * GET /rate-limit
 */
export async function checkRemainingBudget(apiKey) {
  const key = apiKey ?? getApiKey();
  if (!key) {
    throw new Error("API key required to check remaining budget");
  }
  const data = await apiFetch(`${BASE}/rate-limit`, { apiKey: key });
  // gem_finder sees nesting under rate_limit; support both shapes
  const rl = data.rate_limit ?? data;
  return {
    dailyBudgetUsd: rl.daily_budget_usd ?? null,
    dailyUsedUsd: rl.daily_used_usd ?? null,
    dailyRemainingUsd: rl.daily_remaining_usd ?? null,
    raw: data,
  };
}

export async function searchSources(query, opts = {}) {
  const data = await apiFetch(
    `${BASE}/sources?search=${encodeURIComponent(query)}&per_page=8` +
    `&select=id,display_name,issn_l,works_count,type,host_organization_name`,
    opts
  );
  return data.results || [];
}

export async function resolveJournalNames(names, opts = {}) {
  const resolved = [], failed = [];
  for (const name of names) {
    const q = name.trim();
    if (!q) continue;
    try {
      const results = await searchSources(q, opts);
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

/**
 * Canonical year range for works filters.
 * - all-time: `{ start: null, end: null }`  (only representation — no separate allTime flag)
 * - from year → present: `{ start: Y }` or a bare number `Y` (legacy)
 * - closed range: `{ start: Y1, end: Y2 }`
 */
function buildDateFilter(yearRange) {
  if (!yearRange) return "";
  const { start, end } = yearRange;
  if (start == null && end == null) return ""; // all-time
  const parts = [];
  if (start != null) parts.push(`from_publication_date:${start}-01-01`);
  if (end != null) parts.push(`to_publication_date:${end}-12-31`);
  return parts.length ? `,${parts.join(",")}` : "";
}

/** @returns {{ start: number|null, end: number|null|undefined }} */
function normalizeYearRange(yearRangeOrFromYear) {
  if (typeof yearRangeOrFromYear === "number") {
    return { start: yearRangeOrFromYear, end: undefined };
  }
  if (!yearRangeOrFromYear) return { start: null, end: null };
  return {
    start: yearRangeOrFromYear.start ?? null,
    end: yearRangeOrFromYear.end === undefined ? undefined : yearRangeOrFromYear.end,
  };
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

/** Minimal Set B path: record author IDs only (empty works / institutions). */
function processAuthorIdsOnly(works, authorMap) {
  for (const work of works) {
    for (const authorship of (work.authorships || [])) {
      const aid = authorship.author?.id;
      if (!aid) continue;
      if (!authorMap.has(aid)) {
        authorMap.set(aid, { id: aid, works: new Map(), institutions: new Set() });
      }
    }
  }
}

/**
 * Cursor-paginated works fetch for one or more sources.
 * Pages within one source are sequential; different sources still run via a pool (default concurrency 4).
 *
 * @param {string[]} sourceIds
 * @param {number|{ start?: number|null, end?: number|null }} yearRangeOrFromYear
 *   Pass `{ start: null, end: null }` for all-time.
 * @param {{
 *   apiKey?: string,
 *   minimalSelect?: boolean,
 *   onProgress?: Function,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 * }} [opts]
 * @returns {Promise<Map<string, { id: string, works: Map, institutions: Set }>>}
 */
export async function fetchWorksForSources(sourceIds, yearRangeOrFromYear, opts = {}) {
  // Backward-compat: old signature (sourceIds, fromYear, onProgress, signal)
  if (typeof opts === "function") {
    const onProgress = opts;
    const signal = arguments[3];
    opts = { onProgress, signal };
  }

  const {
    apiKey,
    minimalSelect = false,
    onProgress,
    signal,
    concurrency = 4,
    /** Optional map of short sourceId → meta.count from a prior estimate (skips recount). */
    knownCounts = null,
  } = opts;

  const yearRange = normalizeYearRange(yearRangeOrFromYear);
  const dateFilter = buildDateFilter(yearRange);
  const select = minimalSelect ? MINIMAL_WORKS_SELECT : FULL_WORKS_SELECT;
  const process = minimalSelect ? processAuthorIdsOnly : processWorks;
  const authorMap = new Map();

  const fetchOneSource = async (sourceId) => {
    if (signal?.aborted) throw new Error("Cancelled");
    const sid = sourceId.replace("https://openalex.org/", "");
    const filterBase = `primary_location.source.id:${sid}${dateFilter},type:article`;

    let total;
    if (knownCounts && knownCounts[sid] != null) {
      total = knownCounts[sid];
    } else {
      const meta = await apiFetch(
        `${BASE}/works?filter=${filterBase}&per_page=1&select=id`,
        { apiKey, signal }
      );
      total = meta.meta?.count || 0;
    }
    onProgress?.({ phase: "count", sourceId: sid, total });
    if (total === 0) return;

    let cursor = "*";
    let fetched = 0;
    let page = 0;

    while (cursor) {
      if (signal?.aborted) throw new Error("Cancelled");
      const data = await apiFetch(
        `${BASE}/works?filter=${filterBase}` +
        `&per_page=${getWorksPerPage()}&cursor=${encodeURIComponent(cursor)}` +
        `&select=${select}`,
        { apiKey, signal }
      );
      const works = data.results || [];
      process(works, authorMap);
      page += 1;
      fetched += works.length;
      onProgress?.({
        phase: "works",
        sourceId: sid,
        page,
        fetched,
        total,
        pages: total ? Math.ceil(total / getWorksPerPage()) : page,
      });

      cursor = data.meta?.next_cursor || null;
      if (!works.length) break;
    }
  };

  const tasks = sourceIds.map((id) => () => fetchOneSource(id));
  await runPool(tasks, concurrency);
  return authorMap;
}

/**
 * Convenience: Set B exclusive path — author ID set only, minimal select.
 * @returns {Promise<Set<string>>}
 */
export async function fetchAuthorIdsForSources(sourceIds, yearRangeOrFromYear, opts = {}) {
  const map = await fetchWorksForSources(sourceIds, yearRangeOrFromYear, {
    ...opts,
    minimalSelect: true,
  });
  return new Set(map.keys());
}

/** Year range used for a Set B lookback. */
export function yearRangeForLookback(lookback, setAYearRange) {
  if (lookback === "allTime") return { start: null, end: null };
  const start =
    typeof setAYearRange === "number"
      ? setAYearRange
      : setAYearRange?.start ?? null;
  return { start, end: undefined };
}

export class PreflightCancelledError extends Error {
  constructor(estimate) {
    super("Set B all-time fetch cancelled at preflight confirmation");
    this.name = "PreflightCancelledError";
    this.estimate = estimate || null;
  }
}

/**
 * Count works per source for a Set B lookback and estimate list-call cost.
 * Does not fetch the works themselves — one cheap count call per source (+ optional /rate-limit).
 */
export async function estimateSetBFetch(sourceIds, lookback, setAYearRange, opts = {}) {
  const { apiKey, signal } = opts;
  const yearRange = yearRangeForLookback(lookback, setAYearRange);
  const dateFilter = buildDateFilter(yearRange);

  const perSource = [];
  let totalWorks = 0;
  let estimatedListCalls = 0;

  for (const sourceId of sourceIds) {
    if (signal?.aborted) throw new Error("Cancelled");
    const sid = sourceId.replace("https://openalex.org/", "");
    const filterBase = `primary_location.source.id:${sid}${dateFilter},type:article`;
    const meta = await apiFetch(
      `${BASE}/works?filter=${filterBase}&per_page=1&select=id`,
      { apiKey, signal }
    );
    const count = meta.meta?.count || 0;
    const pageCalls = count === 0 ? 0 : Math.ceil(count / getWorksPerPage());
    // 1 count call + N cursor page calls
    const listCalls = 1 + pageCalls;
    perSource.push({ sourceId: sid, count, listCalls });
    totalWorks += count;
    estimatedListCalls += listCalls;
  }

  let budget = null;
  let listCostUsd = DEFAULT_LIST_COST_USD;
  try {
    budget = await checkRemainingBudget(apiKey);
    const endpointCost = budget.raw?.rate_limit?.endpoint_costs_usd?.list;
    if (typeof endpointCost === "number" && endpointCost > 0) listCostUsd = endpointCost;
  } catch {
    // Keyless /rate-limit may fail — still return work-count estimate
  }

  const estimatedCostUsd = estimatedListCalls * listCostUsd;
  const remainingUsd = budget?.dailyRemainingUsd ?? lastUsage?.remainingUsd ?? null;
  const fractionOfRemaining =
    remainingUsd != null && remainingUsd > 0 ? estimatedCostUsd / remainingUsd : null;

  const needsConfirmation =
    lookback === "allTime" &&
    (remainingUsd != null
      ? estimatedCostUsd >= remainingUsd ||
        estimatedCostUsd >= Math.max(PREFLIGHT_CONFIRM_MIN_USD, PREFLIGHT_CONFIRM_FRACTION * remainingUsd)
      : estimatedCostUsd >= PREFLIGHT_CONFIRM_MIN_USD);

  return {
    lookback,
    perSource,
    totalWorks,
    estimatedListCalls,
    listCostUsd,
    estimatedCostUsd,
    budget,
    remainingUsd,
    fractionOfRemaining,
    needsConfirmation,
  };
}

/**
 * Cache-aware Set B author-ID fetch.
 * - Cache key: sorted sourceIds + lookback (+ fromYear when sameWindow)
 * - allTime: estimates cost and may call confirmAllTime(estimate) before fetching
 * - Set A is never written through this path
 *
 * @param {string[]} sourceIds
 * @param {'sameWindow'|'allTime'} lookback
 * @param {{ start: number }|number} setAYearRange
 * @param {{
 *   apiKey?: string,
 *   signal?: AbortSignal,
 *   onProgress?: Function,
 *   skipCache?: boolean,
 *   confirmAllTime?: (estimate: object) => boolean | Promise<boolean>,
 * }} [opts]
 * @returns {Promise<{
 *   authorIds: Set<string>,
 *   fromCache: boolean,
 *   cacheKey: string,
 *   estimate?: object,
 *   cacheWrite?: object,
 * }>}
 */
export async function getSetBAuthorIds(sourceIds, lookback, setAYearRange, opts = {}) {
  const {
    apiKey,
    signal,
    onProgress,
    skipCache = false,
    confirmAllTime,
    /** Optional override for whether to prompt (defaults to estimate.needsConfirmation). */
    confirmIf,
  } = opts;

  const fromYear =
    typeof setAYearRange === "number"
      ? setAYearRange
      : setAYearRange?.start ?? null;

  const cacheKey = buildSetBCacheKey(sourceIds, lookback, setAYearRange);

  if (!skipCache) {
    const cached = readSetBCache(cacheKey);
    if (cached.hit) {
      onProgress?.({
        phase: "cache_hit",
        cacheKey,
        authorCount: cached.authorIds.size,
        meta: cached.meta,
      });
      return {
        authorIds: cached.authorIds,
        fromCache: true,
        cacheKey,
        estimate: null,
        cacheWrite: null,
      };
    }
  }

  let estimate = null;
  if (lookback === "allTime") {
    estimate = await estimateSetBFetch(sourceIds, lookback, setAYearRange, { apiKey, signal });
    onProgress?.({ phase: "preflight", estimate });
    const shouldConfirm =
      typeof confirmIf === "function" ? !!confirmIf(estimate) : estimate.needsConfirmation;
    if (shouldConfirm) {
      const confirmFn =
        confirmAllTime ||
        ((est) => {
          const rem =
            est.remainingUsd != null ? `$${est.remainingUsd.toFixed(4)} remaining` : "unknown remaining";
          return window.confirm(
            `All-time Set B fetch: ~${est.totalWorks.toLocaleString()} works ` +
              `(~${est.estimatedListCalls} list calls ≈ $${est.estimatedCostUsd.toFixed(4)}). ` +
              `Daily budget: ${rem}. Proceed?`
          );
        });
      const ok = await confirmFn(estimate);
      if (!ok) throw new PreflightCancelledError(estimate);
    }
  }

  const yearRange = yearRangeForLookback(lookback, setAYearRange);
  const knownCounts = estimate
    ? Object.fromEntries(estimate.perSource.map((p) => [p.sourceId, p.count]))
    : null;
  const authorIds = await fetchAuthorIdsForSources(sourceIds, yearRange, {
    apiKey,
    signal,
    onProgress,
    knownCounts,
  });

  const totalWorks = estimate?.totalWorks ?? null;

  const cacheWrite = writeSetBCache(cacheKey, {
    lookback,
    sourceIds,
    fromYear,
    authorIds,
    totalWorks,
  });
  if (cacheWrite.warning) {
    onProgress?.({ phase: "cache_warning", warning: cacheWrite.warning, cacheWrite });
  }

  return {
    authorIds,
    fromCache: false,
    cacheKey,
    estimate,
    cacheWrite,
  };
}

const GROUP_BY_SUBFIELD = "primary_topic.subfield.id";

/**
 * Cursor-paginated group_by histogram for one or more sources.
 * @returns {Promise<{ groups: Map<string,{id,name,count}>, totalWorks: number, calls: number, estimatedCostUsd: number }>}
 */
export async function fetchGroupByHistogram(sourceIds, groupBy, yearRangeOrFromYear, opts = {}) {
  const { apiKey, signal, onProgress } = opts;
  const yearRange = normalizeYearRange(yearRangeOrFromYear);
  const dateFilter = buildDateFilter(yearRange);
  const sids = sourceIds.map(id => id.replace("https://openalex.org/", "")).filter(Boolean);
  if (!sids.length) {
    return { groups: new Map(), totalWorks: 0, calls: 0, estimatedCostUsd: 0 };
  }

  const filterBase = `primary_location.source.id:${sids.join("|")}${dateFilter},type:article`;
  const groups = new Map();
  let cursor = "*";
  let calls = 0;
  let totalWorks = 0;

  while (cursor) {
    if (signal?.aborted) throw new Error("Cancelled");
    const data = await apiFetch(
      `${BASE}/works?filter=${filterBase}` +
      `&group_by=${groupBy}&per_page=${getWorksPerPage()}&cursor=${encodeURIComponent(cursor)}`,
      { apiKey, signal }
    );
    calls += 1;
    if (data.meta?.count != null) totalWorks = data.meta.count;
    for (const g of data.group_by || []) {
      const id = g.key;
      if (!id) continue;
      const prev = groups.get(id);
      const count = g.count || 0;
      if (prev) prev.count += count;
      else groups.set(id, { id, name: g.key_display_name || id, count });
    }
    onProgress?.({ phase: "group_by", calls, groups: groups.size, totalWorks });
    cursor = data.meta?.next_cursor || null;
    if (!(data.group_by || []).length) break;
  }

  return {
    groups,
    totalWorks,
    calls,
    estimatedCostUsd: calls * DEFAULT_LIST_COST_USD,
  };
}

/** Rough cost estimate for a subfield gap run (A + B histograms). No network. */
export function estimateTopicGapCost(sourceCountA, sourceCountB) {
  // Subfields usually fit in 1–few pages per set; OR-filter keeps it ~constant in set size.
  const callsPerSide = 3; // conservative upper-ish for cursor pages
  const calls = callsPerSide * 2;
  return {
    estimatedCalls: calls,
    estimatedCostUsd: calls * DEFAULT_LIST_COST_USD,
    note: `${sourceCountA}+${sourceCountB} sources · ~${calls} group_by calls`,
  };
}

/**
 * Fetch A and B subfield histograms for corpus-level topic-gap analysis.
 */
export async function fetchSubfieldHistograms(sourceIdsA, sourceIdsB, yearRangeA, yearRangeB, opts = {}) {
  const [histA, histB] = await Promise.all([
    fetchGroupByHistogram(sourceIdsA, GROUP_BY_SUBFIELD, yearRangeA, opts),
    fetchGroupByHistogram(sourceIdsB, GROUP_BY_SUBFIELD, yearRangeB, opts),
  ]);
  return { histA, histB, calls: histA.calls + histB.calls, costUsd: histA.estimatedCostUsd + histB.estimatedCostUsd };
}
