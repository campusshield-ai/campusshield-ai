# CampusShield AI campus knowledge crawler (staging)

## What is implemented

- A verified campus administrator can register the university's already-registered official HTTPS hostname, list sources, manually crawl, and search the campus index from the crawler panel.
- Each crawl is manually triggered and capped at 8 HTML pages. It follows only same-host HTTPS links, rejects local/private host patterns, skips redirects, enforces a 1 MB page limit, checks `robots.txt` (fails closed if it cannot be checked), and ignores common binary downloads.
- Cleaned text is stored with a source URL, fetch timestamp, and SHA-256 content hash. The same campus+URL is updated rather than duplicated.
- RLS isolates indexed content by active, verified campus membership. Database policies require the source hostname to match the university's registered `official_website`; the NUC directory `source_url` is not treated as the university's own website.
- ShieldMind retrieves up to four matching published pages from the signed-in user's campus, passes excerpts as untrusted evidence to the model, and returns source links and retrieval timestamps. It must not invent an official answer when no relevant source is found.

## Setup

1. In the staging Supabase project, open the campus/university record and confirm `official_website` is the correct official HTTPS homepage. If it is missing or incorrect, have a verified administrator correct it before adding a crawler source. Do not use a third-party directory as a substitute.
2. Open CampusShield AI using the staging deployment and sign in with a verified campus administrator account.
3. Open **Campus Knowledge Crawler**.
4. Enter a descriptive source title and the official homepage root URL (for example `https://university.example/`). Confirm you are authorized to add it, then select **Add source**.
5. Select **Crawl now**. The first run may index fewer than eight pages because of the site's robots policy, redirects, access controls, or content type.
6. Search the indexed pages. Verify the links and content against the live official website before relying on them.
7. Ask ShieldMind a question about the indexed campus information. If the AI provider secret is not configured in staging, ShieldMind returns a safe fallback and source links rather than pretending it generated an AI answer.

## Operational safety

- No background schedule is enabled; an administrator must manually start each crawl.
- Never add authenticated portals, student records, identity-document URLs, incident reports, private Helpdesk systems, or websites you are not authorized to crawl.
- Treat scraped content as untrusted. It can contain misleading instructions; the assistant prompt tells the model to treat it as source data, not instructions.
- Monitor crawler errors and re-check source accuracy. Remove or pause sources when the university's official website changes.
- The Edge Function uses JWT verification and the user's session; do not disable JWT verification.
- This work has been deployed only to staging project `hywcpnoqqhxvujnimhxl`. Production remains unchanged.
