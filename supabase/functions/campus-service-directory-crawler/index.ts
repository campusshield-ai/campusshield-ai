import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const BOT_NAME = "CampusShieldServiceDirectoryBot";
const BOT_AGENT = BOT_NAME + "/1.0 (+https://campusshield-ai.github.io/campusshield-ai/)";
const MAX_HTML_BYTES = 750_000;
const MAX_ROBOTS_BYTES = 100_000;
const MAX_PAGES_PER_UNIVERSITY = 5;
const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;
const FETCH_TIMEOUT_MS = 4_500;
const MIN_REQUEST_GAP_MS = 200;
const RECRAWL_AFTER_DAYS = 30;

type Category = "medical" | "student_affairs" | "registrar";
type OfficeCandidate = { url: string; title: string; phone: string | null; email: string | null };
type LinkCandidate = { url: URL; score: number };
type CrawlResult = {
  university_id: string;
  university_name: string;
  status: string;
  pages_scanned: number;
  office_pages_found: number;
  populated_fields: number;
  message: string;
};

const CATEGORY_DEFS: Record<Category, {
  terms: RegExp;
  pathTerms: RegExp;
  titleTerms: RegExp;
  urlField: string;
  phoneField: string;
  emailField: string;
  sourceField: string;
}> = {
  medical: {
    terms: /\b(medical|clinic|health\s*(centre|center|service|services|unit)|student\s*health|hospital|wellbeing|wellness)\b/i,
    pathTerms: /(medical|clinic|health[-_/]?(centre|center|service|services|unit)|student[-_/]?health|hospital|wellbeing|wellness)/i,
    titleTerms: /(medical|clinic|health\s*(centre|center|service|services|unit)|student\s*health|hospital|wellbeing|wellness)/i,
    urlField: "medical_services_url",
    phoneField: "medical_phone",
    emailField: "medical_email",
    sourceField: "medical_source_url",
  },
  student_affairs: {
    terms: /\b(student\s*affairs|dean\s*of\s*students|student\s*services|student\s*welfare|student\s*development|student\s*life)\b/i,
    pathTerms: /(student[-_/]?(affairs|services|welfare|development|life)|dean[-_/]?of[-_/]?students)/i,
    titleTerms: /(student\s*affairs|dean\s*of\s*students|student\s*services|student\s*welfare|student\s*development|student\s*life)/i,
    urlField: "student_affairs_url",
    phoneField: "student_affairs_phone",
    emailField: "student_affairs_email",
    sourceField: "student_affairs_source_url",
  },
  registrar: {
    terms: /\b(registrar|registry|academic\s*records|academic\s*affairs|office\s*of\s*the\s*registrar)\b/i,
    pathTerms: /(registrar|registry|academic[-_/]?(records|affairs))/i,
    titleTerms: /(registrar|registry|academic\s*records|academic\s*affairs|office\s*of\s*the\s*registrar)/i,
    urlField: "registrar_url",
    phoneField: "registrar_phone",
    emailField: "registrar_email",
    sourceField: "registrar_source_url",
  },
};

const corsHeadersFor = (origin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
  if (!origin) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  let host = "";
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return headers; }
  const allowed = host === "campusshield-ai.github.io" ||
    /^campusshield-ai-staging-preview-[a-z0-9-]+\.vercel\.app$/.test(host) ||
    /^campusshield-ai-staging-p-git-[a-z0-9-]+\.vercel\.app$/.test(host);
  if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};

function reply(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizePublicHttps(raw: string, base?: string): URL {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Only public HTTPS pages on the standard port may be crawled.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host === "metadata.google.internal" || host === "metadata.google" ||
    host.includes(":") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(host) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    throw new Error("Private, local, IP-address, and metadata hosts are not allowed.");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
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
      throw new Error("Response exceeded the configured size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    });
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pageTextFromHtml(html: string): { title: string; text: string; links: LinkCandidate[] } {
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 240);
  const text = stripTags(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
  ).slice(0, 50_000);

  const links: LinkCandidate[] = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null && links.length < 120) {
    const attrs = match[1] || "";
    const href = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!href) continue;
    const rawHref = href[1] || href[2] || href[3] || "";
    if (!rawHref || rawHref.startsWith("#") || /^(javascript|data|mailto|tel):/i.test(rawHref)) continue;
    const label = stripTags(match[2] || "").slice(0, 220);
    links.push({ url: (() => { try { return normalizePublicHttps(rawHref, "https://invalid.invalid"); } catch { return null; } })() as unknown as URL, score: linkScore(rawHref, label) });
    const last = links[links.length - 1];
    // Store the raw URL for later resolution against the fetched page; invalid entries are removed downstream.
    (last as unknown as { rawHref?: string; label?: string }).rawHref = rawHref;
    (last as unknown as { label?: string }).label = label;
  }
  return { title, text, links };
}

function linkScore(rawHref: string, label: string): number {
  const text = (rawHref + " " + label).toLowerCase();
  let score = 0;
  for (const category of Object.values(CATEGORY_DEFS)) {
    if (category.pathTerms.test(rawHref) || category.titleTerms.test(label)) score = Math.max(score, 10);
  }
  if (/\b(contact|contact us|directory|people|offices|office|services|support)\b/i.test(text)) score = Math.max(score, 3);
  if (/\b(login|log in|sign in|portal|password|admin|dashboard|account|search)\b/i.test(text)) score = -10;
  if (/\.(pdf|zip|rar|7z|png|jpe?g|gif|webp|mp4|mp3|docx?|xlsx?|pptx?)(?:$|[?#])/i.test(rawHref)) score = -10;
  return score;
}

function isSensitivePath(path: string): boolean {
  return /(^|\/)(login|signin|sign-in|auth|admin|dashboard|account|profile|password|student-portal|portal|search)(\/|$)/i.test(path) ||
    /\.(pdf|zip|rar|7z|png|jpe?g|gif|webp|mp4|mp3|docx?|xlsx?|pptx?)(?:$|\/)/i.test(path);
}

async function fetchHtml(url: URL, host: string): Promise<string> {
  if (url.hostname.toLowerCase() !== host) throw new Error("cross_domain_blocked");
  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": BOT_AGENT,
      "Accept": "text/html,application/xhtml+xml;q=0.9",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error("redirect_skipped_add_official_final_url");
  }
  if (!response.ok) throw new Error("http_" + response.status);
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("non_html_skipped");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_HTML_BYTES) throw new Error("page_size_limit");
  return await readLimitedText(response, MAX_HTML_BYTES);
}

type RobotsRule = { allow: boolean; path: string };
async function robotsRules(base: URL): Promise<{ rules: RobotsRule[]; ok: boolean; status: string }> {
  const robotsUrl = new URL("/robots.txt", base.origin);
  try {
    const response = await fetch(robotsUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": BOT_AGENT, "Accept": "text/plain" },
    });
    if (response.status === 404) return { rules: [], ok: true, status: "robots_not_found" };
    if (!response.ok || [301, 302, 303, 307, 308].includes(response.status)) {
      return { rules: [], ok: false, status: "robots_unavailable" };
    }
    const body = await readLimitedText(response, MAX_ROBOTS_BYTES);
    const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
    let agents: string[] = [];
    let rules: RobotsRule[] = [];
    const flush = () => {
      if (agents.length) groups.push({ agents, rules });
      agents = [];
      rules = [];
    };
    for (const sourceLine of body.split(/\r?\n/)) {
      const line = sourceLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const sep = line.indexOf(":");
      if (sep < 0) continue;
      const key = line.slice(0, sep).trim().toLowerCase();
      const value = line.slice(sep + 1).trim();
      if (key === "user-agent") {
        if (rules.length) flush();
        agents.push(value.toLowerCase());
      } else if ((key === "allow" || key === "disallow") && agents.length && value) {
        rules.push({ allow: key === "allow", path: value });
      }
    }
    flush();
    const exact = groups.filter(g => g.agents.some(a => a === BOT_NAME.toLowerCase()));
    const selected = exact.length ? exact : groups.filter(g => g.agents.includes("*"));
    const selectedRules = selected.flatMap(g => g.rules);
    return { rules: selectedRules, ok: true, status: "robots_checked" };
  } catch {
    return { rules: [], ok: false, status: "robots_unavailable" };
  }
}

function robotsAllows(url: URL, rules: RobotsRule[]): boolean {
  const path = url.pathname + url.search;
  const matches = rules.filter(rule => path.startsWith(rule.path)).sort((a, b) => {
    if (b.path.length !== a.path.length) return b.path.length - a.path.length;
    if (a.allow !== b.allow) return a.allow ? -1 : 1;
    return 0;
  });
  return matches.length === 0 || matches[0].allow;
}

function contactFromText(text: string, category: Category, siteHost: string): { phone: string | null; email: string | null } {
  const terms = CATEGORY_DEFS[category].terms;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  const phonePattern = /(?:\+?234[\s().-]*|0)[0-9][0-9\s().-]{7,15}/g;
  const emails = [...text.matchAll(emailPattern)];
  const phones = [...text.matchAll(phonePattern)];
  const baseDomain = siteHost.toLowerCase().replace(/^www\./, "");
  const termWindows: string[] = [];
  const termPattern = new RegExp(terms.source, "ig");
  let termMatch: RegExpExecArray | null;
  while ((termMatch = termPattern.exec(text)) !== null && termWindows.length < 30) {
    termWindows.push(text.slice(Math.max(0, termMatch.index - 300), Math.min(text.length, termMatch.index + 650)));
  }
  let email: string | null = null;
  let phone: string | null = null;
  for (const windowText of termWindows) {
    if (!/\b(phone|telephone|tel\.?|call|hotline|mobile|contact|email|e-mail)\b/i.test(windowText)) continue;
    if (!email) {
      const localEmails = [...windowText.matchAll(emailPattern)];
      for (const item of localEmails) {
        const candidate = String(item[0] || "").toLowerCase();
        const domain = candidate.split("@")[1] || "";
        if (domain === baseDomain || domain.endsWith("." + baseDomain)) {
          email = candidate;
          break;
        }
      }
    }
    if (!phone) {
      const localPhones = [...windowText.matchAll(phonePattern)];
      for (const item of localPhones) {
        const candidate = String(item[0] || "").trim();
        const digits = candidate.replace(/\D/g, "");
        if (digits.length >= 10 && digits.length <= 14) {
          phone = candidate.replace(/\s+/g, " ").slice(0, 36);
          break;
        }
      }
    }
    if (email && phone) break;
  }
  // Contacts are never accepted merely because they occur somewhere on the domain.
  return { phone, email };
}

function classifyPage(url: URL, title: string): Category[] {
  const found: Category[] = [];
  for (const category of Object.keys(CATEGORY_DEFS) as Category[]) {
    const def = CATEGORY_DEFS[category];
    if (def.pathTerms.test(url.pathname) || def.titleTerms.test(title)) found.push(category);
  }
  return found;
}

function cleanHost(raw: string): { base: URL; host: string } {
  const base = normalizePublicHttps(raw);
  base.hash = "";
  base.search = "";
  const host = base.hostname.toLowerCase();
  return { base, host };
}

async function crawlUniversity(
  admin: SupabaseClient,
  university: { id: string; name: string; ownership: string; official_website: string | null },
  userId: string,
): Promise<CrawlResult> {
  const startedAt = new Date().toISOString();
  let pagesScanned = 0;
  const officeCandidates = new Map<Category, OfficeCandidate>();
  let crawlStatus = "no_office_pages_found";
  let crawlError: string | null = null;
  let note = "";
  let serviceRow: Record<string, unknown> | null = null;
  let root: URL | null = null;
  let host = "";

  try {
    if (!university.official_website) throw new Error("official_website_missing");
    const normalized = cleanHost(university.official_website);
    root = normalized.base;
    host = normalized.host;
    const robots = await robotsRules(root);
    if (!robots.ok) throw new Error("robots_unavailable");
    if (!robotsAllows(root, robots.rules)) throw new Error("robots_blocked");

    const { data: existingRow, error: rowError } = await admin
      .from("campus_university_service_directory")
      .select("*")
      .eq("university_id", university.id)
      .maybeSingle();
    if (rowError) throw new Error("service_record_unavailable");
    serviceRow = existingRow || {};

    const queue: URL[] = [root];
    const queued = new Set<string>([root.toString()]);
    const visited = new Set<string>();
    while (queue.length && pagesScanned < MAX_PAGES_PER_UNIVERSITY) {
      const url = queue.shift()!;
      if (visited.has(url.toString())) continue;
      visited.add(url.toString());
      if (url.hostname.toLowerCase() !== host || isSensitivePath(url.pathname) || !robotsAllows(url, robots.rules)) continue;
      if (pagesScanned > 0) await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_GAP_MS));
      try {
        const html = await fetchHtml(url, host);
        pagesScanned++;
        const page = pageTextFromHtml(html);
        if (page.text.length < 60) continue;

        const categories = classifyPage(url, page.title);
        for (const category of categories) {
          if (!officeCandidates.has(category)) {
            const contact = contactFromText(page.title + "\n" + page.text, category, host);
            officeCandidates.set(category, {
              url: url.toString(),
              title: page.title || url.pathname,
              phone: contact.phone,
              email: contact.email,
            });
          } else {
            const prior = officeCandidates.get(category)!;
            const currentContact = contactFromText(page.title + "\n" + page.text, category, host);
            officeCandidates.set(category, {
              ...prior,
              phone: prior.phone || currentContact.phone,
              email: prior.email || currentContact.email,
            });
          }
        }

        const ranked: Array<{ url: URL; score: number }> = [];
        for (const item of page.links as unknown as Array<LinkCandidate & { rawHref?: string; label?: string }>) {
          const rawHref = item.rawHref || "";
          try {
            const link = normalizePublicHttps(rawHref, url.toString());
            if (link.hostname.toLowerCase() !== host || isSensitivePath(link.pathname)) continue;
            if (/\.(pdf|zip|rar|7z|png|jpe?g|gif|webp|mp4|mp3|docx?|xlsx?|pptx?)(?:$|\/)/i.test(link.pathname)) continue;
            link.hash = "";
            link.search = "";
            const key = link.toString();
            if (queued.has(key) || visited.has(key) || !robotsAllows(link, robots.rules)) continue;
            const score = linkScore(rawHref, item.label || "");
            if (score <= 0) continue;
            ranked.push({ url: link, score });
            queued.add(key);
          } catch {
            // Unsafe, malformed, cross-domain, or non-HTTPS links are ignored.
          }
        }
        ranked.sort((a, b) => b.score - a.score || a.url.pathname.localeCompare(b.url.pathname));
        for (const item of ranked) {
          if (queue.length >= 60) break;
          queue.push(item.url);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "page_fetch_failed";
        if (message === "robots_blocked" || message === "robots_unavailable") throw error;
        // Track a generic safe reason only; never persist response bodies or arbitrary source data.
        note = message.startsWith("http_") ? message : "some_pages_skipped";
      }
    }

    const sourceDirectory = university.ownership === "Federal"
      ? "https://www.nuc.edu.ng/federal-univeristies/"
      : university.ownership === "State"
      ? "https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/"
      : "https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/";

    const updates: Record<string, unknown> = {
      university_id: university.id,
      source_directory_url: String(serviceRow?.source_directory_url || sourceDirectory),
      last_crawl_at: new Date().toISOString(),
      last_crawl_status: "success",
      last_crawl_error: null,
      pages_scanned: pagesScanned,
      office_pages_found: officeCandidates.size,
      last_crawl_by: userId,
      updated_at: new Date().toISOString(),
    };
    let populatedFields = 0;
    for (const category of Object.keys(CATEGORY_DEFS) as Category[]) {
      const office = officeCandidates.get(category);
      if (!office) continue;
      const def = CATEGORY_DEFS[category];
      if (!serviceRow?.[def.urlField]) {
        updates[def.urlField] = office.url;
        populatedFields++;
      }
      if (!serviceRow?.[def.sourceField]) {
        updates[def.sourceField] = office.url;
        populatedFields++;
      }
      if (!serviceRow?.[def.phoneField] && office.phone) {
        updates[def.phoneField] = office.phone;
        populatedFields++;
      }
      if (!serviceRow?.[def.emailField] && office.email) {
        updates[def.emailField] = office.email;
        populatedFields++;
      }
    }

    const hasOfficeFields =
      Boolean(serviceRow?.medical_services_url || updates.medical_services_url) ||
      Boolean(serviceRow?.student_affairs_url || updates.student_affairs_url) ||
      Boolean(serviceRow?.registrar_url || updates.registrar_url) ||
      Boolean(serviceRow?.medical_phone || updates.medical_phone || serviceRow?.medical_email || updates.medical_email) ||
      Boolean(serviceRow?.student_affairs_phone || updates.student_affairs_phone || serviceRow?.student_affairs_email || updates.student_affairs_email) ||
      Boolean(serviceRow?.registrar_phone || updates.registrar_phone || serviceRow?.registrar_email || updates.registrar_email);
    updates.data_status = hasOfficeFields
      ? "official_office_pages_verified"
      : (university.official_website ? "official_homepage_only" : "nuc_listing_only");
    if (officeCandidates.size > 0) updates.last_verified_at = new Date().toISOString();
    if (note) {
      crawlStatus = pagesScanned ? "partial" : "failed";
      crawlError = note;
    } else if (pagesScanned === 0) {
      crawlStatus = "failed";
      crawlError = "no_public_html_pages_scanned";
    } else if (officeCandidates.size > 0) {
      crawlStatus = "success";
    }
    updates.last_crawl_status = crawlStatus;
    updates.last_crawl_error = crawlError;

    const { error: saveError } = await admin.from("campus_university_service_directory")
      .upsert(updates, { onConflict: "university_id" });
    if (saveError) throw new Error("service_record_save_failed");

    return {
      university_id: university.id,
      university_name: university.name,
      status: crawlStatus,
      pages_scanned: pagesScanned,
      office_pages_found: officeCandidates.size,
      populated_fields: populatedFields,
      message: crawlError || (officeCandidates.size
        ? "Crawled public pages and recorded candidate office URLs from the official site."
        : "Crawled public pages; no office-specific page could be verified from accessible HTML links."),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "crawl_failed";
    const status = reason === "robots_blocked" ? "blocked_robots" :
      reason === "robots_unavailable" ? "robots_unavailable" :
      reason === "official_website_missing" ? "missing_official_website" : "failed";
    const sourceDirectory = university.ownership === "Federal"
      ? "https://www.nuc.edu.ng/federal-univeristies/"
      : university.ownership === "State"
      ? "https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/"
      : "https://www.nuc.edu.ng/nigerian-univeristies/private-univeristies/";
    const safeUpdates: Record<string, unknown> = {
      university_id: university.id,
      source_directory_url: sourceDirectory,
      last_crawl_at: new Date().toISOString(),
      last_crawl_status: status,
      last_crawl_error: reason.slice(0, 120),
      pages_scanned: pagesScanned,
      office_pages_found: officeCandidates.size,
      last_crawl_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (status === "missing_official_website") safeUpdates.data_status = "nuc_listing_only";
    await admin.from("campus_university_service_directory").upsert(safeUpdates, { onConflict: "university_id" });
    return {
      university_id: university.id,
      university_name: university.name,
      status,
      pages_scanned: pagesScanned,
      office_pages_found: officeCandidates.size,
      populated_fields: 0,
      message: status === "blocked_robots"
        ? "The website's robots.txt disallows crawling this page; no page content was fetched."
        : status === "robots_unavailable"
        ? "robots.txt could not be safely checked; crawling was stopped."
        : status === "missing_official_website"
        ? "No registered official homepage is available; the directory keeps the NUC listing fallback."
        : "The official website could not be crawled safely. Review the registered URL and retry later.",
    };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    const headers = corsHeadersFor(origin);
    if (origin && !headers["Access-Control-Allow-Origin"]) return reply({ error: "Origin not allowed." }, 403, null);
    return new Response("ok", { status: 200, headers });
  }
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405, origin);
  const cors = corsHeadersFor(origin);
  if (origin && !cors["Access-Control-Allow-Origin"]) return reply({ error: "Origin not allowed." }, 403, null);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401, origin);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    if (!supabaseUrl || !anonKey || !secretKey) {
      return reply({ error: "The crawler's server-side database credentials are not configured." }, 503, origin);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return reply({ error: "Your session could not be verified." }, 401, origin);
    const { data: allowed, error: accessError } = await userClient.rpc("platform_is_admin");
    if (accessError || allowed !== true) return reply({ error: "Only a trusted platform administrator can run the national university crawler." }, 403, origin);

    const body = await req.json().catch(() => null);
    if (!body || !["crawl_batch", "crawl_university"].includes(String(body.action || ""))) {
      return reply({ error: "Choose crawl_batch or crawl_university." }, 400, origin);
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let selected: Array<{ id: string; name: string; ownership: string; official_website: string | null }> = [];
    let totalWithHomepage = 0;
    let missingHomepage = 0;
    const { data: universities, error: universityError } = await admin
      .from("campus_universities")
      .select("id,name,ownership,official_website")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500);
    if (universityError || !universities) return reply({ error: "The university directory could not be loaded." }, 503);

    const { data: services, error: serviceError } = await admin
      .from("campus_university_service_directory")
      .select("university_id,last_crawl_at")
      .limit(500);
    if (serviceError) return reply({ error: "The service directory could not be loaded." }, 503);
    const serviceById = new Map((services || []).map((row: Record<string, unknown>) => [String(row.university_id), row]));

    const activeWithSite = universities.filter((u: Record<string, unknown>) =>
      Boolean(String(u.official_website || "").trim()));
    totalWithHomepage = activeWithSite.length;
    missingHomepage = universities.length - totalWithHomepage;

    if (body.action === "crawl_university") {
      const targetId = String(body.university_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return reply({ error: "Choose a valid university." }, 400, origin);
      const target = universities.find((u: Record<string, unknown>) => u.id === targetId);
      if (!target) return reply({ error: "Active university not found." }, 404, origin);
      selected = [target as { id: string; name: string; ownership: string; official_website: string | null }];
    } else {
      const cutoff = Date.now() - RECRAWL_AFTER_DAYS * 24 * 60 * 60 * 1000;
      const candidates = activeWithSite.filter((u: Record<string, unknown>) => {
        const record = serviceById.get(String(u.id));
        const value = record?.last_crawl_at ? Date.parse(String(record.last_crawl_at)) : 0;
        return !value || value < cutoff;
      }).sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const av = serviceById.get(String(a.id))?.last_crawl_at;
        const bv = serviceById.get(String(b.id))?.last_crawl_at;
        const at = av ? Date.parse(String(av)) : 0;
        const bt = bv ? Date.parse(String(bv)) : 0;
        return at - bt || String(a.name).localeCompare(String(b.name));
      });
      const batchSizeRaw = Number(body.batch_size || DEFAULT_BATCH_SIZE);
      const batchSize = Number.isFinite(batchSizeRaw)
        ? Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(batchSizeRaw)))
        : DEFAULT_BATCH_SIZE;
      selected = candidates.slice(0, batchSize) as typeof selected;
      if (!selected.length) {
        return reply({
          done: true,
          message: "No university is due for crawling now. University websites without an official URL remain linked to the NUC listing.",
          universities_with_homepages: totalWithHomepage,
          universities_without_homepages: missingHomepage,
          more_available: false,
          results: [],
        }, 200, origin);
      }
    }

    const results: CrawlResult[] = [];
    for (const university of selected) {
      results.push(await crawlUniversity(admin, university, userData.user.id));
    }

    const { count: notYetCrawled } = await admin.from("campus_university_service_directory")
      .select("university_id", { count: "exact", head: true })
      .is("last_crawl_at", null);
    const failures = results.filter(r => ["failed", "blocked_robots", "robots_unavailable", "missing_official_website"].includes(r.status)).length;
    const pagesScanned = results.reduce((sum, r) => sum + r.pages_scanned, 0);
    const officePagesFound = results.reduce((sum, r) => sum + r.office_pages_found, 0);
    const populatedFields = results.reduce((sum, r) => sum + r.populated_fields, 0);
    return reply({
      done: false,
      results,
      batch_size: selected.length,
      pages_scanned: pagesScanned,
      office_pages_found: officePagesFound,
      fields_populated: populatedFields,
      failed_or_blocked: failures,
      universities_with_homepages: totalWithHomepage,
      universities_without_homepages: missingHomepage,
      universities_never_crawled: notYetCrawled ?? null,
      more_available: body.action === "crawl_university" ? null : (selected.length > 0),
      max_pages_per_university: MAX_PAGES_PER_UNIVERSITY,
      message: "Crawl run finished. Only public HTTPS HTML on each registered university host was considered; robots.txt was enforced, cross-domain links were blocked, and phone/email values were accepted only near explicit office labels on official pages.",
    }, 200, origin);
  } catch {
    return reply({ error: "The university crawler could not complete the request safely." }, 500, origin);
  }
});
