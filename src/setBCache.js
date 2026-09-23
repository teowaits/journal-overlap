/**
 * Set B author-ID cache (localStorage).
 * Keyed on sorted OpenAlex source IDs + lookback (+ fromYear when sameWindow).
 * Set A is intentionally not cached here.
 */

const CACHE_PREFIX = "jo_setb:v1:";
/** Soft cap per entry (~1.5 MB). A few thousand short author IDs is fine; skip past this. */
export const MAX_ENTRY_CHARS = 1_500_000;
/** Soft cap across all Set B cache entries (~4 MB of the typical 5–10 MB origin quota). */
export const MAX_TOTAL_CHARS = 4_000_000;

export function shortSourceId(id) {
  return String(id || "").replace("https://openalex.org/", "");
}

export function shortAuthorId(id) {
  return String(id || "").replace("https://openalex.org/", "");
}

export function expandAuthorId(short) {
  if (!short) return short;
  return short.startsWith("http") ? short : `https://openalex.org/${short}`;
}

/**
 * Stable cache key from identity of the portfolio query — not raw journal-name text.
 * @param {string[]} sourceIds
 * @param {'sameWindow'|'allTime'} lookback
 * @param {{ start?: number }|number|null} [setAYearRange] — included only for sameWindow
 */
export function buildSetBCacheKey(sourceIds, lookback, setAYearRange) {
  const ids = [...sourceIds].map(shortSourceId).filter(Boolean).sort();
  if (lookback === "allTime") {
    return `${CACHE_PREFIX}allTime:${ids.join(",")}`;
  }
  const start =
    typeof setAYearRange === "number"
      ? setAYearRange
      : setAYearRange?.start ?? "na";
  return `${CACHE_PREFIX}sameWindow:${start}:${ids.join(",")}`;
}

function safeStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function listSetBKeys(store) {
  const keys = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  return keys;
}

export function measureSetBCacheBytes() {
  const store = safeStorage();
  if (!store) return { entries: 0, totalChars: 0 };
  let totalChars = 0;
  const keys = listSetBKeys(store);
  for (const k of keys) {
    totalChars += (store.getItem(k) || "").length + k.length;
  }
  return { entries: keys.length, totalChars };
}

/**
 * @returns {{ hit: boolean, authorIds?: Set<string>, meta?: object }}
 */
export function readSetBCache(cacheKey) {
  const store = safeStorage();
  if (!store) return { hit: false };
  try {
    const raw = store.getItem(cacheKey);
    if (!raw) return { hit: false };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.authorIds)) return { hit: false };
    const authorIds = new Set(parsed.authorIds.map(expandAuthorId));
    return {
      hit: true,
      authorIds,
      meta: {
        lookback: parsed.lookback,
        fetchedAt: parsed.fetchedAt,
        totalWorks: parsed.totalWorks,
        authorCount: authorIds.size,
      },
    };
  } catch {
    return { hit: false };
  }
}

function evictOldest(store, needChars) {
  const entries = listSetBKeys(store).map((k) => {
    const raw = store.getItem(k) || "";
    let fetchedAt = 0;
    try {
      fetchedAt = JSON.parse(raw).fetchedAt || 0;
    } catch { /* ignore */ }
    return { key: k, fetchedAt, chars: raw.length + k.length };
  });
  entries.sort((a, b) => a.fetchedAt - b.fetchedAt);
  let freed = 0;
  for (const e of entries) {
    if (freed >= needChars) break;
    store.removeItem(e.key);
    freed += e.chars;
  }
  return freed;
}

/**
 * @returns {{ ok: boolean, skipped?: string, chars?: number, warning?: string }}
 */
export function writeSetBCache(cacheKey, { lookback, sourceIds, fromYear, authorIds, totalWorks }) {
  const store = safeStorage();
  if (!store) return { ok: false, skipped: "no_storage" };

  const payload = {
    v: 1,
    lookback,
    sourceIds: [...sourceIds].map(shortSourceId).sort(),
    fromYear: lookback === "sameWindow" ? fromYear ?? null : null,
    authorIds: [...authorIds].map(shortAuthorId),
    totalWorks: totalWorks ?? null,
    fetchedAt: Date.now(),
  };

  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { ok: false, skipped: "serialize_failed" };
  }

  const chars = serialized.length + cacheKey.length;
  if (chars > MAX_ENTRY_CHARS) {
    return {
      ok: false,
      skipped: "entry_too_large",
      chars,
      warning: `Set B cache entry ~${(chars / 1e6).toFixed(1)}MB exceeds ${(MAX_ENTRY_CHARS / 1e6).toFixed(1)}MB guard — skipping cache write.`,
    };
  }

  const { totalChars } = measureSetBCacheBytes();
  // Replace existing key's footprint if present
  const existing = store.getItem(cacheKey);
  const existingChars = existing ? existing.length + cacheKey.length : 0;
  const projected = totalChars - existingChars + chars;

  if (projected > MAX_TOTAL_CHARS) {
    evictOldest(store, projected - MAX_TOTAL_CHARS + 1);
  }

  try {
    store.setItem(cacheKey, serialized);
    return { ok: true, chars };
  } catch (e) {
    if (e?.name === "QuotaExceededError" || e?.code === 22) {
      evictOldest(store, chars);
      try {
        store.setItem(cacheKey, serialized);
        return {
          ok: true,
          chars,
          warning: "localStorage quota hit — evicted older Set B cache entries.",
        };
      } catch {
        return {
          ok: false,
          skipped: "quota_exceeded",
          chars,
          warning: "localStorage quota exceeded — Set B result used in-memory only this run.",
        };
      }
    }
    return { ok: false, skipped: "write_failed", warning: String(e?.message || e) };
  }
}

export function clearSetBCache() {
  const store = safeStorage();
  if (!store) return 0;
  const keys = listSetBKeys(store);
  for (const k of keys) store.removeItem(k);
  return keys.length;
}
