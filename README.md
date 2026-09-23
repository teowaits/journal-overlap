# Journal Overlap Finder

A browser-based research tool for author scouting across journal sets, powered by the [OpenAlex](https://openalex.org) open scholarly metadata API.

Two modes share the same Set A / Set B inputs:

| Mode | What it finds |
|------|----------------|
| **Overlap** | Authors who have published in **both** sets (bridging researchers between communities) |
| **Exclusive** | Authors published in Set A who have **not yet** published in Set B — prospecting candidates for a journal portfolio |

**Live demo:** [https://teowaits.github.io/journal-overlap/](https://teowaits.github.io/journal-overlap/)

---

## Features

| Tab | Overlap | Exclusive |
|-----|---------|-----------|
| **Authors** | Bridging authors, overlap score, word cloud | Candidate authors (A ∖ B), Set A works, word cloud |
| **Journal Pairs** / **Contributing Journals** | Which A × B pairs share the most authors | Which Set A journals contribute the most candidates |
| **Institutions** | Institutions with the most bridging researchers | Institutions of candidate authors |
| **Topics** | Topic-level overlap (Domain → Field → Subfield → Topic) | Topics of candidate authors; optional **corpus topic-gap** scan (Subfield) |

Also: shareable URLs (`?mode=exclusive&lookback=…&fromYear=…&a=…&b=…`), CSV export on every tab, Set B lookback (same window vs all-time) in Exclusive mode, and a live **OpenAlex usage** chip once an API key is set.

---

## API key (required)

Since February 2026, OpenAlex requires an `api_key` query parameter for authenticated daily budgets. Anonymous access is no longer the practical default for this tool.

1. Get a free key at [openalex.org/settings/api](https://openalex.org/settings/api).
2. Paste it into the **API key** control in the app header (stored in `localStorage` in this browser only).
3. The header **Budget** chip shows remaining daily USD (seeded via `/rate-limit`, updated from response headers on every call).

List/filter calls cost about **$0.0001 each** ($0.10 per 1,000). Single-entity lookups by ID are free. Exclusive mode’s all-time Set B fetch may confirm before a large run if the estimated cost is a meaningful share of remaining budget; the topic-gap scan is cheap and only shows an inline estimate.

---

## Running Locally

**Requirements:** Node.js 18+ and npm.

```bash
# 1. Clone the repo
git clone https://github.com/teowaits/journal-overlap.git
cd journal-overlap

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser and paste your OpenAlex API key.

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

---

## How It Works

1. **Journal resolution** — journal names resolve to OpenAlex Source IDs via `/sources` search.
2. **Work fetching** — articles from each journal (configurable start year) are fetched with cursor pagination (`/works`), capturing authorship, institutions, and `primary_topic`. Page size prefers `per_page=200` (same cost per call as 100) with a defensive fallback to 100.
3. **Author set** —
   - **Overlap:** intersection of Set A and Set B author IDs.
   - **Exclusive:** Set A authors minus Set B author IDs (Set B may use same-window or all-time lookback; all-time IDs are cached in `localStorage`).
4. **Enrichment** — top N authors are enriched via `/authors` (citations, ORCID, last known institution).
5. **Analytics** — journal pairs / contributing journals, institutions, and topic aggregations are computed client-side. Exclusive **topic gaps** optionally use cheap `group_by=primary_topic.subfield.id` calls over the full A/B corpora (relative share thresholds, not raw zero-in-B).

### Practical limits

| Set size | Estimated run time |
|----------|--------------------|
| 1–3 journals | 10–30 seconds |
| 5–10 journals | 1–3 minutes |
| 20+ journals | 5–10+ minutes |

Large mega-journals (e.g. PLOS ONE, Scientific Reports) have ~15–20k articles per year and will hit the 10k per-journal paging wall without year chunking. Exclusive all-time Set B can be much larger — use the preflight estimate and cache.

---

## Data & Acknowledgements

All scholarly metadata is provided by **[OpenAlex](https://openalex.org)** — a fully open index of global research output maintained by [OurResearch](https://ourresearch.org). OpenAlex data is released under the [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) public domain dedication.

> Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of the world's research. *arXiv*. https://doi.org/10.48550/arXiv.2205.01833

---

## Created By

**[teowaits](https://github.com/teowaits)**

This tool was built with the assistance of Claude by Anthropic, following OpenAlex API best practices:

- Two-step journal resolution (search → ID) rather than filtering by name
- `api_key` on every request; usage headers + `/rate-limit` for budget awareness
- Retry with backoff on transient 429; immediate stop when daily budget is exhausted
- `select=` field filtering to minimise response payload
- Cursor pagination (and year chunking where needed) past the 10k result wall
- Client-side intersection / exclusion and analytics to avoid redundant API calls

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| **1.4.0** | 2026-09 | **Exclusive mode** (authors in A not yet in B): mode toggle, Set B same-window/all-time lookback with localStorage cache and cost preflight, Contributing Journals tab, exclusive Institutions/Topics copy, corpus topic-gap scan (Subfield `group_by`), OpenAlex API key UI + usage indicator. Engine prefers `per_page=200` with fallback to 100. README updated for post–Feb 2026 `api_key` requirement |
| **1.3.1** | 2026-05-13 | **Authors tab** CSV export: `ORCID` and `OpenAlex ID` columns now emit bare identifiers (`0000-0002-5832-4054`, `A5077867821`) instead of full URLs |
| **1.3.0** | 2026-05-13 | **Authors tab** CSV export gains two new trailing columns: `journal_1_openalex_id` (pipe-separated OpenAlex Source IDs for Set A) and `journal_2_openalex_id` (pipe-separated OpenAlex Source IDs for Set B). Existing 11-column schema is unchanged — new columns append at position 12–13. Enables the Author Email Resolver sibling tool to anchor DOI lookup within the overlap journal set and avoid author disambiguation errors. No additional API call required; IDs are already in app state at export time |
| **1.2.0** | 2026-04-08 | **Authors tab** CSV export now includes a `type` column (value: `author`) and a `Note` column (`from journal-overlap · A × B`). **Topics tab** gains an "Export for Gem Finder" button alongside the existing export; it produces a 4-column CSV (`type`, `OpenAlex ID`, `display_name`, `notes`) covering all topics and subfields combined, ready to import directly into [Gem Finder](https://github.com/teowaits/gem_finder) |
| **1.1.0** | 2026-03-11 | CSV export on all tabs; shareable URLs with `?a=...&b=...` and Copy Link button; configurable start year (2020–2025); mobile-responsive tables; empty-state onboarding with example comparisons; parallel API fetching (4x concurrency); paginated author list (50 at a time); retry with backoff on 429/5xx errors; codebase split from 1 file into 12 modules; global CSS extracted to stylesheet; Open Graph / Twitter meta tags; SVG favicon; GitHub Pages deployment via Actions |
| **1.0.0** | 2025-XX-XX | Initial release — journal search, author overlap, journal pairs, institution & topic analysis |

---

## License

[MIT](LICENSE)
