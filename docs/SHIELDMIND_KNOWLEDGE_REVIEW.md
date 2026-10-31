# ShieldMind Knowledge Library — review-first workflow

## Purpose

ShieldMind may answer university-specific questions only from approved public sources for the student's verified university. Crawling is not publication. New or changed content must remain hidden until a trusted owner has opened the source and explicitly approved it.

## Babcock pilot source

The university directory in Staging currently registers the official site as `https://babcock.edu.ng`. The following same-host pages are candidate crawl starting points. They are not yet registered in the Staging knowledge library and have not been crawled or approved by CampusShield:

- `https://babcock.edu.ng/` — official homepage
- `https://babcock.edu.ng/sitemap` — official sitemap
- `https://babcock.edu.ng/admission/tuition-and-fees` — tuition and fees
- `https://babcock.edu.ng/food-services/cafe-hours` — café hours
- `https://babcock.edu.ng/residence` — residence information
- `https://babcock.edu.ng/calendar` — academic calendar

The first source registration must use the root domain already stored in `campus_universities.official_website`. The crawler intentionally stays on that exact host. Do not add `legacy.babcock.edu.ng`, `buth.babcock.edu.ng`, `workspace.babcock.edu.ng`, `codel.babcock.edu.ng` or `admissions.babcock.edu.ng` as crawl targets until the university's official-domain record and its authority for each host have been checked.

## Workflow implemented in this branch

1. The trusted owner selects a university in Platform Administration.
2. The owner registers the official root website. The Edge Function checks that its host exactly matches the university's registered official website.
3. A crawl fetches at most 8 public HTML pages per run, remains on the approved host, rejects sensitive login/account/admin paths, checks `robots.txt`, limits response size and time, and skips non-HTML content.
4. New pages are stored with `status = 'hidden'`. If an existing published page is fetched again with the exact same content hash, its published status is preserved. A changed page is hidden until reviewed, so stale or changed information is not silently used by ShieldMind.
5. A trusted owner opens each pending page, checks its source and content, and explicitly confirms publication. Otherwise it remains hidden.
6. Crawl and review events are recorded in the existing owner-only `campus_crawler_runs` and `campus_crawler_events` tables. If a publication audit event cannot be saved, the code attempts to return the page to `hidden`.

The Knowledge Agent reads only `published` pages joined to an `approved` source and scoped to the authenticated student's university. Hidden pages are not available to student retrieval.

## Limits and release requirements

- The current page schema supports only `published` and `hidden`; this workflow uses `hidden` as the unpublished review state. The review UI therefore lists hidden pages only when there is a matching saved `knowledge_page_staged` audit event.
- The existing Staging knowledge-page/source migrations and some owner-access migration history are present in Staging but missing from the current GitHub migration directory. Restore the exact historical migration sources and reconcile migration parity before merging this work or deploying it to another environment. Do not recreate or edit those historical migrations from memory.
- This PR restores the currently deployed crawler source to version control and proposes the safer review behaviour. It has not deployed a new Edge Function version, registered a source, crawled Babcock pages, or changed any database records.
- An authenticated staging test must verify source registration, crawl, pending-page review, publish, and cross-university isolation before any production release.
