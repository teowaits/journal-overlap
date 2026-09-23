import { useState, useEffect } from "react";
import { C } from "../constants.js";
import {
  onUsageUpdate,
  getLastUsage,
  getApiKey,
  checkRemainingBudget,
} from "../api.js";

/**
 * Persistent OpenAlex daily-budget chip.
 * Pattern: OPENALEX_USAGE_INDICATOR.md — prefer Remaining-USD; seed via /rate-limit on load.
 *
 * States (doc thresholds):
 * - Normal: remaining > ~20% of daily budget
 * - Low: remaining ≤ ~20%
 * - Exhausted: remaining ≤ 0
 */
export default function UsageIndicator() {
  const [usage, setUsage] = useState(() => getLastUsage());
  const [hasKey, setHasKey] = useState(() => !!getApiKey());

  useEffect(() => onUsageUpdate((u) => {
    setUsage(u);
    setHasKey(!!getApiKey());
  }), []);

  // Seed from /rate-limit once a key is present (before any other billable call this session)
  useEffect(() => {
    const key = getApiKey();
    if (!key) return;
    let cancelled = false;
    (async () => {
      try {
        const b = await checkRemainingBudget(key);
        if (cancelled) return;
        setHasKey(true);
        setUsage(prev => ({
          limit: prev?.limit ?? null,
          remaining: prev?.remaining ?? null,
          creditsUsed: prev?.creditsUsed ?? null,
          resetSeconds: prev?.resetSeconds ?? null,
          limitUsd: b.dailyBudgetUsd ?? prev?.limitUsd ?? 1,
          remainingUsd: b.dailyRemainingUsd ?? prev?.remainingUsd,
          costUsd: prev?.costUsd ?? null,
        }));
      } catch { /* key invalid or offline — chip stays quiet */ }
    })();
    return () => { cancelled = true; };
  }, [hasKey]);

  useEffect(() => {
    const sync = () => {
      const k = !!getApiKey();
      setHasKey(k);
      const last = getLastUsage();
      if (last) setUsage(last);
    };
    window.addEventListener("focus", sync);
    const id = setInterval(sync, 2000);
    return () => {
      window.removeEventListener("focus", sync);
      clearInterval(id);
    };
  }, []);

  if (!hasKey && !usage) {
    return (
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.04em", textAlign: "right", lineHeight: 1.5 }} title="Paste an API key to track your personal daily budget">
        Budget · no key
      </div>
    );
  }

  const remainingUsd = usage?.remainingUsd;
  const limitUsd = usage?.limitUsd ?? 1;
  const resetSeconds = usage?.resetSeconds;
  const fraction = remainingUsd != null && limitUsd > 0 ? remainingUsd / limitUsd : null;
  const low = fraction != null && fraction <= 0.2 && remainingUsd > 0;
  const exhausted = remainingUsd != null && remainingUsd <= 0;
  const normal = !low && !exhausted && remainingUsd != null;

  const resetHint = resetSeconds != null
    ? `Resets in ~${Math.max(1, Math.ceil(resetSeconds / 3600))}h`
    : null;

  const color = exhausted ? C.red : low ? C.amber : C.textMuted;

  // Doc: normal can be subtle/hidden — keep a quiet chip so operators know it's live
  if (normal && remainingUsd > limitUsd * 0.5) {
    return (
      <div
        style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.04em", textAlign: "right", lineHeight: 1.5, opacity: 0.75 }}
        title={[`$${remainingUsd.toFixed(4)} remaining`, resetHint].filter(Boolean).join(" · ")}
      >
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Budget</span>
        <br />
        ${remainingUsd.toFixed(2)}
      </div>
    );
  }

  return (
    <div
      style={{ fontSize: 10, color, letterSpacing: "0.04em", textAlign: "right", lineHeight: 1.5 }}
      title={
        usage
          ? [
              remainingUsd != null ? `$${remainingUsd.toFixed(4)} remaining today` : null,
              usage.remaining != null ? `${usage.remaining.toLocaleString()} credits left` : null,
              resetHint,
            ].filter(Boolean).join(" · ")
          : "Usage updates after the next OpenAlex call"
      }
    >
      {remainingUsd != null ? (
        <>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Budget</span>
          <br />
          ${remainingUsd.toFixed(2)} left
          {low ? " · low" : ""}
          {exhausted ? " · exhausted" : ""}
          {exhausted && resetHint ? <><br />{resetHint}</> : null}
        </>
      ) : (
        <>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Budget</span>
          <br />
          waiting for calls…
        </>
      )}
    </div>
  );
}
