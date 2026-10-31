import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_PAGES_PER_RUN = 8;
const MAX_HTML_BYTES = 1_000_000;
const USER_AGENT = "CampusShieldKnowledgeBot/1.0 (+https://campusshield-ai.github.io/campusshield-ai/)";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function normalizeUrl(raw: string, base?: string): URL {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Only public HTTPS URLs on the standard port are allowed.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host === "metadata.google.internal" || host === "169.254.169.254" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(host) ||
    host.includes(":")
  ) throw new Error("Private or local network hosts are not allowed.");
  url.hash = "";
  url.username = "";
  url.password = "";
  return url;
}
function isSensitivePath(pathname: string): boolean {
  return /(^|\/)(login|signin|sign-in|auth|admin|dashboard|account|profile|password|student-portal|portal|search|checkout)(\/|$)/i.test(pathname) ||
    /\.(pdf|zip|rar|7z|png|jpe?g|gif|webp|mp4|mp3|docx?|xlsx?|pptx?)(?:$|\/)/i.test(pathname);
}

function cleanText(html: string): { title: string; text: string; links: string[] } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, 240);
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    if (links.length >= 80) break;
    links.push(match[1]);
  }
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/[ \t\f\v]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim().slice(0, 40000);
  return { title, text, links };
}
async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Page exceeds the configured crawl size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
async function fetchText(url: URL, expectedHost: string): Promise<{ html: string; finalUrl: URL }> {
  if (url.hostname.toLowerCase() !== expectedHost) throw new Error("Cross-domain crawl blocked.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", redirect: "manual", signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9" },
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without a destination was blocked.");
      const target = normalizeUrl(location, url.toString());
      if (target.hostname.toLowerCase() !== expectedHost) throw new Error("Cross-domain redirect blocked.");
      throw new Error("Redirects are skipped; add the final HTTPS URL as the approved source.");
    }
    if (!response.ok) throw new Error(`Page returned HTTP ${response.status}.`);
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("Only HTML pages are indexed.");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) throw new Error("Page exceeds the 1 MB crawl limit.");
    const html = await readLimitedText(response, MAX_HTML_BYTES);
    return { html, finalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}
async function allowedByRobots(base: URL, candidate: URL): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", base.origin);
  try {
    const response = await fetch(robotsUrl.toString(), {
      redirect: "manual", headers: { "User-Agent": USER_AGENT, "Accept": "text/plain" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return true;
    if (!response.ok || [301,302,303,307,308].includes(response.status)) return false;
    const text = await readLimitedText(response, 100000);
    let applies = false;
    let blocked = false;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.replace(/#.*$/, "").trim();
      const colon = trimmed.indexOf(":");
      if (colon < 0) continue;
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if (key === "user-agent") applies = value === "*" || /CampusShieldKnowledgeBot/i.test(value);
      if (applies && key === "disallow" && value && candidate.pathname.startsWith(value)) blocked = true;
      if (applies && key === "allow" && value && candidate.pathname.startsWith(value)) blocked = false;
    }
    return !blocked;
  } catch {
    return false; // fail closed when robots.txt cannot be checked
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return reply({ error: "Crawler is not configured." }, 503);
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return reply({ error: "Your session could not be verified." }, 401);
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("role,verification_status").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.verification_status !== "verified") {
      return reply({ error: "A verified campus account is required." }, 403);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return reply({ error: "Choose a crawler action." }, 400);
    const requestedUniversityId = String(body.university_id || "").trim();
    if (requestedUniversityId && !/^[0-9a-f-]{36}$/i.test(requestedUniversityId)) {
      return reply({ error: "Choose a valid university." }, 400);
    }
    const crawlerOwnerEmail = "campusshieldaitechnologies@gmail.com";
    const isCrawlerOwner = String(user.email || "").toLowerCase() === crawlerOwnerEmail;
    const { data: memberships, error: membershipError } = await client.from("campus_memberships")
      .select("university_id,campus_role,membership_status,verification_status")
      .eq("user_id", user.id).eq("membership_status", "active").eq("verification_status", "verified").limit(50);
    const memberCampus = !membershipError && memberships?.length
      ? (requestedUniversityId
        ? memberships.find(m => m.university_id === requestedUniversityId)
        : (memberships.find(m => m.campus_role === "admin") || memberships[0]))
      : null;
    if (body.action === "search") {
      if (!memberCampus) return reply({ error: "An active verified campus membership at the selected university is required." }, 403);
      const campus = memberCampus;
      const query = String(body.query || "").trim().replace(/[\u0000-\u001f]/g, " ").slice(0, 120);
      if (query.length < 2) return reply({ results: [] });
      const words = query.split(/\s+/).filter(w => w.length > 1).slice(0, 5);
      let request = client.from("campus_knowledge_pages")
        .select("id,title,url,body_text,fetched_at")
        .eq("university_id", campus.university_id).eq("status", "published")
        .order("fetched_at", { ascending: false }).limit(30);
      // RLS enforces same-campus membership; query text is parameterized by PostgREST.
      request = request.ilike("body_text", `%${words[0].replace(/[%_,()]/g, " ")}%`);
      const { data, error } = await request;
      if (error) return reply({ error: "Campus knowledge search is unavailable." }, 503);
      const results = (data || []).map((row: any) => ({
        id: row.id, title: row.title, url: row.url, fetched_at: row.fetched_at,
        excerpt: String(row.body_text || "").slice(0, 900),
      }));
      return reply({ results });
    }
    if (!isCrawlerOwner || profile.role !== "admin") {
      return reply({ error: "Only the verified CampusShield platform owner can manage knowledge sources." }, 403);
    }
    if (!requestedUniversityId) return reply({ error: "Select the university to manage." }, 400);
    // The platform owner is granted global access by private.is_campusshield_owner_admin()
    // and the corresponding RLS policies. A per-university campus membership is not
    // required for this owner-only workflow; the selected university must still exist.
    const { data: selectedUniversity, error: universityError } = await client.from("campus_universities")
      .select("id").eq("id", requestedUniversityId).maybeSingle();
    if (universityError || !selectedUniversity) return reply({ error: "Selected university was not found or is not accessible." }, 404);
    const campus = { university_id: selectedUniversity.id, campus_role: "admin" };
    if (body.action === "list_sources") {
      const { data, error } = await client.from("campus_knowledge_sources")
        .select("id,title,base_url,domain,status,last_crawled_at,last_crawl_status,created_at")
        .eq("university_id", campus.university_id).order("created_at", { ascending: false }).limit(50);
      if (error) return reply({ error: "Could not load approved sources." }, 503);
      const { count } = await client.from("campus_knowledge_pages").select("id", { count: "exact", head: true })
        .eq("university_id", campus.university_id);
      const { count: pendingCount } = await client.from("campus_knowledge_pages").select("id", { count: "exact", head: true })
        .eq("university_id", campus.university_id).eq("status", "hidden");
      return reply({ sources: data || [], indexed_pages: count || 0, pending_review: pendingCount || 0 });
    }
    if (body.action === "list_pending_pages") {
      // Include every hidden page from an approved source. This also recovers a
      // staged page if its crawl audit event could not be written after the page
      // upsert; review_page creates a recovery audit run before any decision.
      const { data, error } = await client.from("campus_knowledge_pages")
        .select("id,title,url,body_text,fetched_at,updated_at,content_hash,source:campus_knowledge_sources!inner(status,domain)")
        .eq("university_id", campus.university_id)
        .eq("status", "hidden")
        .eq("source.status", "approved")
        .order("fetched_at", { ascending: false })
        .limit(50);
      if (error) return reply({ error: "Pending pages could not be loaded. Confirm that this account has platform-owner review access." }, 503);
      return reply({
        pages: (data || []).map((page: any) => ({
          id: page.id,
          title: String(page.title || "Official campus page").slice(0, 240),
          url: String(page.url || ""),
          excerpt: String(page.body_text || "").slice(0, 1400),
          fetched_at: page.fetched_at,
          updated_at: page.updated_at,
          content_hash: page.content_hash,
        })),
      });
    }
    if (body.action === "review_page") {
      if (body.confirm_review !== true) return reply({ error: "Explicit page review confirmation is required." }, 400);
      const pageId = String(body.page_id || "");
      const decision = String(body.decision || "");
      if (!/^[0-9a-f-]{36}$/i.test(pageId)) return reply({ error: "Choose a valid page." }, 400);
      if (!["publish", "keep_hidden"].includes(decision)) return reply({ error: "Choose publish or keep hidden." }, 400);
      const { data: page, error: pageError } = await client.from("campus_knowledge_pages")
        .select("id,title,url,status,content_hash,source:campus_knowledge_sources!inner(id,status,domain)")
        .eq("id", pageId)
        .eq("university_id", campus.university_id)
        .eq("status", "hidden")
        .eq("source.status", "approved")
        .maybeSingle();
      if (pageError || !page) return reply({ error: "The pending page was not found under an approved source for this university." }, 404);
      let checkedPageUrl: URL | null = null;
      try { checkedPageUrl = new URL(String(page.url || "")); } catch { /* invalid stored URL */ }
      // PostgREST may infer a to-many relationship for the nested source join.
      // Normalize it before comparing the exact approved host.
      const pageSource = Array.isArray(page.source) ? page.source[0] || null : page.source || null;
      const approvedDomain = String(pageSource?.domain || "").toLowerCase();
      if (
        !checkedPageUrl ||
        checkedPageUrl.protocol !== "https:" ||
        checkedPageUrl.username ||
        checkedPageUrl.password ||
        (checkedPageUrl.port && checkedPageUrl.port !== "443") ||
        checkedPageUrl.hostname.toLowerCase() !== approvedDomain
      ) {
        return reply({ error: "The page URL must be standard-port HTTPS and match its approved source domain." }, 400);
      }
      const { data: stageEvent, error: stageEventError } = await client.from("campus_crawler_events")
        .select("run_id,metadata")
        .eq("event_type", "knowledge_page_staged")
        .eq("university_id", campus.university_id)
        .contains("metadata", { page_id: pageId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (stageEventError) return reply({ error: "The page's audit history could not be checked safely." }, 503);
      let reviewRunId = stageEvent?.run_id || null;
      if (!reviewRunId) {
        const { data: recoveryRun, error: recoveryRunError } = await client.from("campus_crawler_runs").insert({
          started_by: user.id,
          action: "crawl_university",
          status: "completed",
          universities_requested: 1,
          completed_at: new Date().toISOString(),
          pages_scanned: 1,
          results: [{ crawler: "campus-knowledge-crawler", recovery_review: true, page_id: pageId, university_id: campus.university_id }],
        }).select("id").single();
        if (recoveryRunError || !recoveryRun?.id) return reply({ error: "Could not create the missing review audit run." }, 503);
        reviewRunId = recoveryRun.id;
        const { error: recoveryEventError } = await client.from("campus_crawler_events").insert({
          run_id: reviewRunId,
          event_type: "knowledge_page_recovered_for_review",
          university_id: campus.university_id,
          page_url: page.url,
          status: "hidden",
          message: "Hidden page had no matching staging event; owner review audit was recovered before a decision.",
          metadata: {
          page_id: pageId,
          source_id: pageSource?.id || null,
          content_hash: page.content_hash || null,
          recovered_by: user.id,
        },
        });
        if (recoveryEventError) return reply({ error: "Could not save the recovery audit event. The page remains hidden." }, 503);
      }
      const stagedContentHash = stageEvent?.metadata?.content_hash || page.content_hash || null;
      const reviewedAt = new Date().toISOString();
      if (decision === "keep_hidden") {
        const { error: keepAuditError } = await client.from("campus_crawler_events").insert({
          run_id: reviewRunId, event_type: "knowledge_page_kept_hidden",
          university_id: campus.university_id, page_url: page.url, status: "hidden",
          message: "Owner reviewed the page and chose to keep it hidden.",
          metadata: { page_id: pageId, reviewed_by: user.id, reviewed_at: reviewedAt, content_hash: stagedContentHash },
        });
        if (keepAuditError) return reply({ error: "The review decision could not be audited; the page remains hidden." }, 503);
        return reply({ reviewed: true, published: false, status: "hidden", page_id: pageId });
      }
      const { data: updated, error: updateError } = await client.from("campus_knowledge_pages")
        .update({ status: "published", updated_at: reviewedAt })
        .eq("id", pageId).eq("university_id", campus.university_id).eq("status", "hidden")
        .select("id,title,url,status,updated_at").maybeSingle();
      if (updateError || !updated) return reply({ error: "The page could not be published. It may have changed since review." }, 409);
      const { error: publishAuditError } = await client.from("campus_crawler_events").insert({
        run_id: reviewRunId, event_type: "knowledge_page_published",
        university_id: campus.university_id, page_url: page.url, status: "published",
        message: "Owner approved the page after manually reviewing its official source and content.",
        metadata: { page_id: pageId, reviewed_by: user.id, reviewed_at: reviewedAt, content_hash: stagedContentHash },
      });
      if (publishAuditError) {
        const { error: rollbackError } = await client.from("campus_knowledge_pages")
          .update({ status: "hidden", updated_at: new Date().toISOString() })
          .eq("id", pageId).eq("university_id", campus.university_id).eq("status", "published");
        if (rollbackError) return reply({ error: "The audit log failed and the page could not be returned to hidden. Stop crawler use and escalate this review immediately." }, 500);
        return reply({ error: "The review audit could not be saved; the page was returned to hidden and was not published." }, 503);
      }
      return reply({ reviewed: true, published: true, page: updated });
    }
    if (body.action === "add_source") {
      if (body.confirm_official !== true) return reply({ error: "Confirm that you are authorized to add this official public source." }, 400);
      const title = String(body.title || "").trim().slice(0, 160);
      if (title.length < 2) return reply({ error: "Enter a source name (2–160 characters)." }, 400);
      let url: URL;
      try { url = normalizeUrl(String(body.url || "")); } catch (e) { return reply({ error: e instanceof Error ? e.message : "Invalid URL." }, 400); }
      if (url.pathname !== "/" && url.pathname !== "") return reply({ error: "Add the official website root (for example https://university.edu.ng/). The crawler will follow same-domain links." }, 400);
      const domain = url.hostname.toLowerCase();
      const { data: university, error: universityError } = await client.from("campus_universities")
        .select("official_website").eq("id", campus.university_id).maybeSingle();
      if (universityError || !university) return reply({ error: "The campus official website could not be verified." }, 503);
      let registeredDomain = "";
      try { registeredDomain = new URL(String(university.official_website || "")).hostname.toLowerCase(); } catch { /* no verified official website is registered */ }
      if (!registeredDomain || registeredDomain !== domain) {
        return reply({ error: "For safety, only the university's registered official website can be crawled. Ask a verified campus administrator to update the official website record first." }, 400);
      }
      const { data, error } = await client.from("campus_knowledge_sources").insert({
        university_id: campus.university_id, title, base_url: url.toString(), domain, created_by: user.id, status: "approved",
      }).select("id,title,base_url,domain,status,last_crawled_at,last_crawl_status").single();
      if (error) return reply({ error: error.code === "23505" ? "This domain is already registered for your campus." : "The source could not be saved." }, 400);
      return reply({ source: data });
    }
    if (body.action === "crawl_source") {
      const sourceId = String(body.source_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return reply({ error: "Choose a valid source." }, 400);
      const { data: source, error: sourceError } = await client.from("campus_knowledge_sources")
        .select("id,title,base_url,domain,status,university_id")
        .eq("id", sourceId).eq("university_id", campus.university_id).maybeSingle();
      if (sourceError || !source || source.status !== "approved") return reply({ error: "Approved source not found for this campus." }, 404);
      const { data: run, error: runError } = await client.from("campus_crawler_runs").insert({
        started_by: user.id,
        action: "crawl_university",
        status: "running",
        universities_requested: 1,
        results: [{ crawler: "campus-knowledge-crawler", source_id: source.id, university_id: source.university_id }],
      }).select("id").single();
      if (runError || !run?.id) return reply({ error: "Could not create the private knowledge-crawl history record." }, 503);
      const runId = run.id;
      const base = normalizeUrl(source.base_url);
      const queue: URL[] = [base];
      const visited = new Set<string>();
      let saved = 0, skipped = 0, pendingReview = 0;
      let lastError = "";
      while (queue.length && visited.size < MAX_PAGES_PER_RUN) {
        const url = queue.shift()!;
        if (visited.has(url.toString())) continue;
        visited.add(url.toString());
        if (url.hostname.toLowerCase() !== source.domain || isSensitivePath(url.pathname) || !await allowedByRobots(base, url)) { skipped++; continue; }
        try {
          const { html } = await fetchText(url, source.domain);
          const page = cleanText(html);
          if (page.text.length < 100) { skipped++; continue; }
          const hash = await sha256(page.title + "\n" + page.text);
          const { data: existingPage, error: existingPageError } = await client.from("campus_knowledge_pages")
            .select("id,content_hash,status")
            .eq("university_id", source.university_id)
            .eq("url", url.toString())
            .maybeSingle();
          if (existingPageError) throw new Error("Existing page review state could not be checked.");
          const preservePublished = existingPage?.status === "published" && existingPage.content_hash === hash;
          const pageStatus = preservePublished ? "published" : "hidden";
          const { data: savedPage, error: upsertError } = await client.from("campus_knowledge_pages").upsert({
            university_id: source.university_id, source_id: source.id, url: url.toString(),
            title: page.title || url.hostname, body_text: page.text, content_hash: hash,
            status: pageStatus, fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }, { onConflict: "university_id,url" }).select("id").single();
          if (upsertError || !savedPage?.id) throw new Error("Database refused to store the crawled page.");
          const { error: auditError } = await client.from("campus_crawler_events").insert({
            run_id: runId,
            event_type: preservePublished ? "knowledge_page_unchanged" : "knowledge_page_staged",
            university_id: source.university_id,
            page_url: url.toString(),
            status: pageStatus,
            message: preservePublished
              ? "Previously approved page content is unchanged; publication was preserved."
              : "New or changed public page saved hidden pending owner review.",
            metadata: { page_id: savedPage.id, source_id: source.id, content_hash: hash, pending_review: !preservePublished },
          });
          if (auditError) throw new Error("The page review audit event could not be saved.");
          saved++;
          if (!preservePublished) pendingReview++;
          for (const href of page.links) {
            if (queue.length >= 100) break;
            try {
              const link = normalizeUrl(href, url.toString());
              if (link.hostname.toLowerCase() === source.domain && !visited.has(link.toString()) &&
                  !isSensitivePath(link.pathname)) {
                queue.push(link);
              }
            } catch { /* unsafe or malformed links are intentionally ignored */ }
          }
        } catch (e) {
          skipped++;
          lastError = e instanceof Error ? e.message.slice(0, 180) : "A page could not be fetched.";
        }
      }
      const crawlStatus = saved ? (lastError ? "partial" : "completed") : "failed";
      const completedAt = new Date().toISOString();
      const { error: runUpdateError } = await client.from("campus_crawler_runs").update({
        status: crawlStatus, completed_at: completedAt, pages_scanned: visited.size,
        failed_or_blocked: skipped,
        results: [{ crawler: "campus-knowledge-crawler", source_id: source.id, university_id: source.university_id, saved, skipped, pending_review: pendingReview, status: crawlStatus }],
      }).eq("id", runId);
      const { error: completionAuditError } = await client.from("campus_crawler_events").insert({
        run_id: runId, event_type: "knowledge_crawl_completed",
        university_id: source.university_id, status: crawlStatus,
        message: "Knowledge crawl finished; new or changed pages remain hidden until explicit review.",
        metadata: { source_id: source.id, saved, skipped, pending_review: pendingReview, run_history_update_failed: Boolean(runUpdateError) },
      });
      await client.from("campus_knowledge_sources").update({
        last_crawled_at: completedAt, last_crawl_status: `${crawlStatus}; saved=${saved}; skipped=${skipped}; pending_review=${pendingReview}`,
      }).eq("id", source.id).eq("university_id", source.university_id);
      return reply({
        run_id: runId, saved, skipped, visited: visited.size, pending_review: pendingReview, status: crawlStatus,
        audit_saved: !runUpdateError && !completionAuditError,
        message: saved
          ? `Fetched ${saved} public page(s); ${pendingReview} new or changed page(s) are hidden pending explicit owner review.`
          : "No pages were indexed. Check the official site's robots.txt and access rules.",
      });
    }
    return reply({ error: "Unsupported crawler action." }, 400);
  } catch (_error) {
    return reply({ error: "The campus knowledge crawler could not complete this request." }, 500);
  }
});
