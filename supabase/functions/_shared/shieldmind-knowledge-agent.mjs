/**
 * Read-only ShieldMind Knowledge Agent retrieval.
 *
 * Uses the caller-authenticated Supabase client so existing RLS policies remain
 * authoritative. This module never accepts a service-role client or writes data.
 */

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "what", "when", "where", "how", "can",
  "does", "from", "about", "are", "was", "were", "this", "that", "you",
  "your", "our", "their", "have", "has", "into", "tell", "please",
]);

const MAX_KEYWORDS = 4;
const MAX_SOURCES = 4;
const MAX_EXCERPT_LENGTH = 1800;

export function extractKnowledgeKeywords(question) {
  if (typeof question !== "string") return [];
  const tokens = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return [...new Set(tokens.filter((word) => !STOP_WORDS.has(word)))].slice(0, MAX_KEYWORDS);
}

function scorePage(page, keywords) {
  const title = String(page.title || "").toLowerCase();
  const body = String(page.body_text || "").toLowerCase();
  return keywords.reduce((score, keyword) => {
    const titleMatches = title.split(keyword).length - 1;
    const bodyMatches = body.split(keyword).length - 1;
    return score + (titleMatches * 5) + Math.min(bodyMatches, 4);
  }, 0);
}

/**
 * @param {object} options
 * @param {any} options.client A Supabase client authenticated as the requesting user.
 * @param {string} options.universityId The university resolved by get_my_campus_context.
 * @param {boolean} options.isVerifiedCampusMember True only for active + verified membership.
 * @param {string} options.question User question, already length-validated by the API.
 */
export async function retrieveApprovedCampusKnowledge({
  client,
  universityId,
  isVerifiedCampusMember,
  question,
}) {
  if (!client || !universityId || isVerifiedCampusMember !== true) return [];

  const keywords = extractKnowledgeKeywords(question);
  if (!keywords.length) return [];

  const pagesByUrl = new Map();

  for (const keyword of keywords) {
    // Tokens come from a Unicode letter/number allow-list, so they cannot inject
    // PostgREST filter syntax. The relation filter excludes paused source records.
    const { data, error } = await client
      .from("campus_knowledge_pages")
      .select("title,url,body_text,fetched_at,source:campus_knowledge_sources!inner(status)")
      .eq("university_id", universityId)
      .eq("status", "published")
      .eq("source.status", "approved")
      .or(`title.ilike.%${keyword}%,body_text.ilike.%${keyword}%`)
      .order("fetched_at", { ascending: false })
      .limit(5);

    if (error) {
      // Fail closed: do not turn retrieval errors into guessed campus answers.
      return [];
    }

    for (const page of data || []) {
      const url = String(page.url || "");
      if (!url || pagesByUrl.has(url)) continue;
      pagesByUrl.set(url, {
        title: String(page.title || "Official campus page").slice(0, 240),
        url,
        fetched_at: String(page.fetched_at || ""),
        excerpt: String(page.body_text || "").slice(0, MAX_EXCERPT_LENGTH),
        relevance: scorePage(page, keywords),
      });
    }
  }

  return [...pagesByUrl.values()]
    .filter((page) => page.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || Date.parse(b.fetched_at || "") - Date.parse(a.fetched_at || ""))
    .slice(0, MAX_SOURCES)
    .map(({ relevance: _relevance, ...source }) => source);
}
