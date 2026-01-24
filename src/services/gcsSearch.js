// Google Custom Search helper
// Requires env vars:
// REACT_APP_GCS_KEY = Google API key
// REACT_APP_GCS_CX  = Custom Search Engine ID

const GCS_KEY = process.env.REACT_APP_GCS_KEY || "";
const GCS_CX = process.env.REACT_APP_GCS_CX || "";

export function gcsEnabled() {
  return Boolean(GCS_KEY && GCS_CX);
}

function extractRandPrices(text) {
  if (!text) return [];
  // Extract patterns like: R29.99, R 29,99, ZAR 29.99, etc.
  const s = String(text);
  const matches = s.match(/(?:R|ZAR)\s?\d{1,4}(?:[.,]\d{1,2})?/gi) || [];
  const nums = matches
    .map((m) =>
      m
        .replace(/ZAR/gi, "")
        .replace(/R/gi, "")
        .replace(/\s+/g, "")
        .replace(",", ".")
    )
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

  return nums;
}

export function computeBenchmarkFromResults(results) {
  const all = [];
  for (const r of results) {
    all.push(...extractRandPrices(r.snippet));
    all.push(...extractRandPrices(r.title));
  }
  if (!all.length) return null;

  all.sort((a, b) => a - b);

  const min = all[0];
  const max = all[all.length - 1];

  // If spread is absurd, still return a range but cap the messaging
  return {
    min,
    max,
    sampleCount: all.length
  };
}

export async function gcsSearch(query, opts = {}) {
  const { num = 5, site = "" } = opts;

  if (!gcsEnabled()) {
    return {
      ok: false,
      reason: "NO_KEY",
      results: []
    };
  }

  const q = site ? `${query} site:${site}` : query;
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GCS_KEY)}` +
    `&cx=${encodeURIComponent(GCS_CX)}` +
    `&q=${encodeURIComponent(q)}` +
    `&num=${encodeURIComponent(String(Math.min(Math.max(num, 1), 10)))}`;

  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, reason: `HTTP_${res.status}`, results: [] };
  }

  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  const results = items.slice(0, num).map((it) => ({
    title: it?.title || "Result",
    link: it?.link || "",
    snippet: it?.snippet || "",
    displayLink: it?.displayLink || ""
  })).filter(r => r.link);

  return { ok: true, reason: "OK", results };
}
