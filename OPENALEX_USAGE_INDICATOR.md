# OpenAlex Usage Indicator — Reusable Pattern

> Tool-agnostic. Written from journal-overlap's implementation (Exclusive mode work, Sept 2026), for reuse in gem_finder, Author Email Resolver, journal-profiler, wherearetheeditors, and any other tool in this family that calls the OpenAlex API. Paste this into a Cursor session for whichever tool you're updating.

---

## What this is

A small, live header chip showing OpenAlex daily-budget state — normal / low / exhausted — plus a correct way to tell "budget spent" apart from "transient throttle" on a 429. Built once for journal-overlap; this doc is what makes it portable rather than reinvented per tool.

---

## Get the cost model right first (we got it wrong once)

**OpenAlex bills per call, not per result.** Their own docs and blog are explicit: costs scale with requests, not results — "a search that returns 10 results costs about the same as one that returns 10,000." $0.10 per 1,000 calls for list+filter and search; single-entity lookups by ID/DOI are free and unlimited regardless of volume.

Practical implications, all confirmed empirically, not just from docs:

- **Maximize `per_page`, don't minimize it.** `per_page=200` works today on both plain list calls and `group_by` calls, despite the documented ceiling being 100 — and it costs the *same* $0.0001 per call as `per_page=100`. That's real ~1.8–2× fewer calls, and therefore real ~1.8–2× lower cost, for the same data. Use 200, but add a defensive fallback to 100 if a 400 is ever traced specifically to the `per_page` value — it's undocumented behavior, not a supported guarantee, and could tighten without notice.
- **`group_by` is cheap regardless of corpus size.** Getting an aggregated count (e.g. works per topic) costs the same per call as fetching individual records — a handful of calls covers a group breakdown over an arbitrarily large underlying corpus. Prefer `group_by` over fetching-then-counting whenever you need a distribution rather than the individual records themselves.
- **`group_by` results paginate the same way work listings do.** Basic `page=N` hits the same 10,000-result wall and will 400 past it — use `cursor=*` → `next_cursor` once the number of distinct groups is large (topic-level group-by's routinely need this; domain-level, with only a handful of possible values, typically doesn't).

---

## Data source

Every response carries these headers (confirmed live, not all of them are in OpenAlex's own written docs):

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Daily budget, in credits (10,000 credits = $1) |
| `X-RateLimit-Remaining` | Credits left today |
| `X-RateLimit-Credits-Used` | Credits this call cost (0 on error responses — reading these costs nothing) |
| `X-RateLimit-Reset` | Seconds until midnight UTC reset |
| `X-RateLimit-Limit-USD` / `-Remaining-USD` / `-Cost-USD` | Same, dollar-denominated — prefer these for the indicator and for classification, they're unambiguous |

There's also a dedicated preflight endpoint, useful for an initial check on page load before any billable call has been made this session:

```
GET https://api.openalex.org/rate-limit?api_key=YOUR_KEY

{ "rate_limit": {
    "daily_budget_usd": 1,
    "daily_used_usd": 0.0031,
    "daily_remaining_usd": 0.9969
} }
```

---

## Reading headers on every response, not just success

The response that matters most for a usage indicator is the one where budget is exhausted — which is an error response. Wire header-reading into the shared fetch wrapper so it runs on **every** response, success or error, not just the happy path.

---

## 429 classification: spent budget vs. transient throttle

Both look identical at the HTTP level (429). Classify using the dollar-denominated remaining header, not `Retry-After`'s magnitude:

```js
function isBudgetExhausted429(headers) {
  const remainingUsd = parseFloat(headers.get('X-RateLimit-Remaining-USD'));
  if (!Number.isNaN(remainingUsd)) return remainingUsd <= 0;
  // fallback only if the USD header is ever absent
  const remainingCredits = parseInt(headers.get('X-RateLimit-Remaining'), 10);
  return remainingCredits === 0;
}
```

- **Spent budget** → throw immediately, don't retry, surface the reset time to the user. Retrying just burns time waiting for a reset that could be hours away.
- **Transient throttle** → short `Retry-After` (~1–2s), retry with that delay as normal.

Do not use `Retry-After`'s magnitude alone as the classifier — validated in practice (journal-overlap step 2) to misfire: a large `Retry-After` doesn't reliably mean budget is spent.

---

## Indicator states (suggested thresholds — tune per tool)

| State | Condition | Chip |
|---|---|---|
| Normal | remaining-USD comfortably above ~20% of daily budget | subtle/neutral, or hidden |
| Low | remaining-USD ≤ ~20% of daily budget | amber, shows remaining $ + reset countdown |
| Exhausted | remaining-USD ≤ 0 | red, shows reset time, blocks further billable actions with a clear message |

---

## Implementation sketch (framework-agnostic)

```js
// shared usage state, updated by trackUsage() on every fetch response
let usage = { limitUsd: null, remainingUsd: null, resetSeconds: null };

function trackUsage(headers) {
  const remainingUsd = parseFloat(headers.get('X-RateLimit-Remaining-USD'));
  const limitUsd = parseFloat(headers.get('X-RateLimit-Limit-USD'));
  const resetSeconds = parseInt(headers.get('X-RateLimit-Reset'), 10);
  if (!Number.isNaN(remainingUsd)) usage = { limitUsd, remainingUsd, resetSeconds };
  onUsageUpdate(usage); // re-render the chip
}

async function checkRemainingBudget(apiKey) {
  const res = await fetch(`https://api.openalex.org/rate-limit?api_key=${apiKey}`);
  const { rate_limit } = await res.json();
  return rate_limit; // { daily_budget_usd, daily_used_usd, daily_remaining_usd }
}
```

Call `checkRemainingBudget` once on load (before any other billable call), then let `trackUsage` keep the chip current from live response headers thereafter.

---

## One thing that does NOT carry over between tools

**The API key itself is stored per-origin (localStorage is scoped to the domain).** If these tools live on different domains/subpaths, pasting a key into one doesn't make it available in another — each tool needs its own paste-once flow, even though the underlying OpenAlex account budget (and therefore what the chip reports) is shared across all of them, since it's a property of the key/account, not of which tool made the call. Worth using the same storage key name (`openalex_api_key`) across tools for consistency, even though the values live in separate origins.

---

## Where this is implemented today

`journal-overlap` — `src/api.js` (`trackUsage`, `checkRemainingBudget`, header chip UI), built during the Exclusive-mode work, Sept 2026. Port from there; don't reimplement from scratch.

## Checklist when porting to another tool

- [ ] Confirm that tool's current pagination approach (`per_page`, basic vs. cursor) — likely has the same `per_page=100`-or-less-than-optimal starting point this tool had.
- [ ] Confirm api_key storage mechanism (`localStorage`, same key name) — flag if it's currently `sessionStorage` or something else, since that's a real behavioral difference, not a rounding error (see journal-overlap's own back-and-forth on this).
- [ ] Wire header-reading into every response, not just success, before relying on the 429 classification.
- [ ] Add the checkRemainingBudget() preflight call on load.
