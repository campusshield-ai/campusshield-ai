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
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only public HTTPS URLs are allowed.");
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
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) throw new Error("Page exceeds the 1 MB crawl limit.");
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
    const text = (await response.text()).slice(0, 100000);
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
    const { data: memberships, error: membershipError } = await client.from("campus_memberships")
      .select("university_id,campus_role,membership_status,verification_status")
      .eq("user_id", user.id).eq("membership_status", "active").eq("verification_status", "verified").limit(5);
    if (membershipError || !memberships?.length) return reply({ error: "An active verified campus membership is required." }, 403);
    const campus = memberships.find(m => m.campus_role === "admin") || memberships[0];
    const isAdmin = campus.campus_role === "admin";
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return reply({ error: "Choose a crawler action." }, 400);
    if (body.action === "search") {
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
    if (!isAdmin || profile.role !== "admin") return reply({ error: "Only a verified campus administrator can manage crawler sources." }, 403);
    if (body.action === "list_sources") {
      const { data, error } = await client.from("campus_knowledge_sources")
        .select("id,title,base_url,domain,status,last_crawled_at,last_crawl_status,created_at")
        .eq("university_id", campus.university_id).order("created_at", { ascending: false }).limit(50);
      if (error) return reply({ error: "Could not load approved sources." }, 503);
      const { count } = await client.from("campus_knowledge_pages").select("id", { count: "exact", head: true })
        .eq("university_id", campus.university_id);
      return reply({ sources: data || [], indexed_pages: count || 0 });
    }
    if (body.action === "add_source") {
      if (body.confirm_official !== true) return reply({ error: "Confirm that you are authorized to add this official public source." }, 400);
      const title = String(body.title || "").trim().slice(0, 160);
      if (title.length < 2) return reply({ error: "Enter a source name (2–160 characters)." }, 400);
      let url: URL;
      try { url = normalizeUrl(String(body.url || "")); } catch (e) { return reply({ error: e instanceof Error ? e.message : "Invalid URL." }, 400); }
      if (url.pathname !== "/" && url.pathname !== "") return reply({ error: "Add the official website root (for example https://university.edu.ng/). The crawler will follow same-domain links." }, 400);
      const domain = url.hostname.toLowerCase();
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
      const base = normalizeUrl(source.base_url);
      const queue: URL[] = [base];
      const visited = new Set<string>();
      let saved = 0, skipped = 0;
      let lastError = "";
      while (queue.length && visited.size < MAX_PAGES_PER_RUN) {
        const url = queue.shift()!;
        if (visited.has(url.toString())) continue;
        visited.add(url.toString());
        if (url.hostname.toLowerCase() !== source.domain || !await allowedByRobots(base, url)) { skipped++; continue; }
        try {
          const { html } = await fetchText(url, source.domain);
          const page = cleanText(html);
          if (page.text.length < 100) { skipped++; continue; }
          const hash = await sha256(page.title + "\n" + page.text);
          const { error: upsertError } = await client.from("campus_knowledge_pages").upsert({
            university_id: source.university_id, source_id: source.id, url: url.toString(),
            title: page.title || url.hostname, body_text: page.text, content_hash: hash,
            status: "published", fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }, { onConflict: "university_id,url" });
          if (upsertError) throw new Error("Database refused to store the crawled page.");
          saved++;
          for (const href of page.links) {
            if (queue.length >= 100) break;
            try {
              const link = normalizeUrl(href, url.toString());
              if (link.hostname.toLowerCase() === source.domain && !visited.has(link.toString()) &&
                  !/\.(pdf|zip|rar|7z|jpg|jpeg|png|gif|webp|mp4|mp3|docx?|xlsx?|pptx?)(?:$|\?)/i.test(link.pathname)) {
                queue.push(link);
              }
            } catch { /* unsafe or malformed links are intentionally ignored */ }
          }
        } catch (e) {
          skipped++;
          lastError = e instanceof Error ? e.message.slice(0, 180) : "A page could not be fetched.";
        }
      }
      const crawlStatus = saved ? (lastError ? "partial" : "success") : "failed";
      await client.from("campus_knowledge_sources").update({
        last_crawled_at: new Date().toISOString(), last_crawl_status: `${crawlStatus}; saved=${saved}; skipped=${skipped}`,
      }).eq("id", source.id).eq("university_id", source.university_id);
      return reply({ saved, skipped, visited: visited.size, status: crawlStatus, message: saved ? `Indexed ${saved} public page(s). Review sources before relying on their content.` : "No pages were indexed. Check the official site's robots.txt and access rules." });
    }
    return reply({ error: "Unsupported crawler action." }, 400);
  } catch (_error) {
    return reply({ error: "The campus knowledge crawler could not complete this request." }, 500);
  }
});
