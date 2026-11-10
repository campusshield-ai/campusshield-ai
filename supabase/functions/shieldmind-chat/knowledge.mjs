const STOP_WORDS = new Set([
  "the", "and", "for", "with", "what", "when", "where", "how", "can", "does",
  "did", "are", "is", "was", "were", "will", "would", "should", "could", "from",
  "about", "please", "tell", "me", "my", "our", "your", "this", "that", "these",
  "those", "find", "show", "give", "help", "need", "want", "know", "explain", "official",
  "explanation", "summary", "summarise", "summarize", "quiz", "test", "plan",
  "revision", "study", "assistant", "shieldmind"
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} question */
export function extractKnowledgeSearchTerms(question, maxTerms = 5) {
  const tokens = normalizeSearchText(question).split(" ").filter(Boolean);
  return [...new Set(tokens.filter(token => token.length >= 3 && !/^\\d{4}$/.test(token) && !STOP_WORDS.has(token)))]
    .slice(0, Math.max(1, Math.min(8, maxTerms)));
}

/** @param {string[]} terms */
export function buildKnowledgeSearchPhrase(terms) {
  return Array.isArray(terms) ? terms.slice(0, 4).join(" ").trim() : "";
}

/**
 * Official university questions must not be answered from model memory alone.
 * Keep this classifier deliberately narrow so ordinary academic tutoring remains available.
 * @param {string} question
 */
export function isOfficialCampusQuestion(question) {
  return /\b(?:official\s+(?:notice|policy|announcement|calendar|information)|polic(?:y|ies)|deadlines?|tuition|school\s+fees?|hostel\s+fees?|residence\s+fees?|admission\s+requirements?|admissions?\s+deadline|academic\s+calendar|semester\s+dates?|exam\s+dates?|course\s+registration|registration\s+deadline|graduation\s+requirements?|matriculation|clearance|transcripts?|student\s+affairs|registrar|library\s+hours|clinic\s+hours|medical\s+centre\s+hours|campus\s+office\s+hours|university\s+(?:rule|requirement|fee|deadline|calendar)|scholarship\s+eligibility)\b/i.test(String(question ?? ""));
}

/**
 * Source timestamps describe when CampusShield retrieved a page, not when the
 * university last changed it. Labels intentionally use "retrieved" language.
 * @param {string|Date|null|undefined} fetchedAt
 * @param {number} now
 */
export function describeKnowledgeFreshness(fetchedAt, now = Date.now()) {
  const timestamp = fetchedAt instanceof Date ? fetchedAt.getTime() : Date.parse(String(fetchedAt ?? ""));
  if (!Number.isFinite(timestamp)) {
    return { age_days: null, freshness_level: "unknown", freshness_label: "Retrieval date unavailable" };
  }
  const ageDays = Math.max(0, Math.floor((now - timestamp) / DAY_MS));
  if (ageDays <= 30) {
    return { age_days: ageDays, freshness_level: "recent", freshness_label: "Recently retrieved" };
  }
  if (ageDays <= 90) {
    return { age_days: ageDays, freshness_level: "aging", freshness_label: `Retrieved ${ageDays} days ago` };
  }
  return {
    age_days: ageDays,
    freshness_level: "stale",
    freshness_label: "Older source — verify current details",
  };
}

/**
 * Score source pages without sending raw queries into PostgREST filter syntax.
 * Titles weigh more heavily than body matches; exact phrase and retrieval recency
 * are small tie-breakers, never substitutes for actual term overlap.
 * @param {{title?:string,body_text?:string,fetched_at?:string}} source
 * @param {string[]} terms
 * @param {string} phrase
 * @param {number} now
 */
export function scoreKnowledgeSource(source, terms, phrase = "", now = Date.now()) {
  const title = normalizeSearchText(source?.title);
  const body = normalizeSearchText(source?.body_text);
  if (!terms?.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (title.split(" ").includes(term)) score += 8;
    else if (title.includes(term)) score += 4;
    const matches = body.split(" ").filter(word => word === term).length;
    score += Math.min(matches, 4) * 1.25;
  }
  const normalizedPhrase = normalizeSearchText(phrase);
  if (normalizedPhrase.length >= 5) {
    if (title.includes(normalizedPhrase)) score += 12;
    else if (body.includes(normalizedPhrase)) score += 5;
  }
  const freshness = describeKnowledgeFreshness(source?.fetched_at, now);
  if (freshness.freshness_level === "recent") score += 1.5;
  else if (freshness.freshness_level === "aging") score += 0.5;
  return score;
}

/**
 * @param {Array<{title?:string,body_text?:string,fetched_at?:string}>} sources
 * @param {string[]} terms
 * @param {string} phrase
 * @param {number} limit
 * @param {number} now
 */
export function rankKnowledgeSources(sources, terms, phrase = "", limit = 4, now = Date.now()) {
  return (Array.isArray(sources) ? sources : [])
    .map(source => ({ source, score: scoreKnowledgeSource(source, terms, phrase, now) }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(String(b.source?.fetched_at || "")) - Date.parse(String(a.source?.fetched_at || ""));
    })
    .slice(0, Math.max(1, Math.min(8, limit)))
    .map(item => ({ ...item.source, relevance_score: Number(item.score.toFixed(2)) }));
}

/**
 * Remove source markers that do not map to the exact evidence list and return
 * only the source records actually cited in the answer.
 * @param {string} answer
 * @param {Array<{marker?:string}>} sources
 */
export function validateKnowledgeCitations(answer, sources) {
  const sourceList = Array.isArray(sources) ? sources : [];
  const byMarker = new Map(sourceList.map(source => [String(source.marker || ""), source]));
  const used = new Set();
  const invalid = new Set();
  const cleanAnswer = String(answer ?? "").replace(/\[(\d{1,2})\]/g, (marker) => {
    if (!byMarker.has(marker)) {
      invalid.add(marker);
      return "";
    }
    used.add(marker);
    return marker;
  }).replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
  const usedSources = sourceList.filter(source => used.has(String(source.marker || "")));
  return { answer: cleanAnswer.trim(), usedSources, invalidMarkers: [...invalid] };
}
