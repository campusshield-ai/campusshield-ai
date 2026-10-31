import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const crawler = read('supabase/functions/campus-knowledge-crawler/index.ts');
const html = read('index.html');
const ui = read('campus-knowledge-admin.js');
assert.match(crawler, /function isSensitivePath/, 'crawler blocks sensitive account and portal paths');
assert.match(crawler, /const preservePublished = existingPage\?\.status === "published" && existingPage\.content_hash === hash/, 'unchanged previously approved pages preserve publication state');
assert.match(crawler, /const pageStatus = preservePublished \? "published" : "hidden"/, 'new and changed crawled pages are hidden pending review');
assert.doesNotMatch(crawler, /status: "published", fetched_at:/, 'crawler does not automatically publish every crawled page');
assert.match(crawler, /body\.action === "list_pending_pages"/, 'owner can load pending hidden pages');
assert.match(crawler, /body\.action === "review_page"/, 'owner has an explicit page review action');
assert.match(crawler, /\.eq\("status", "hidden"\)[\s\S]*\.eq\("source\.status", "approved"\)/, 'all hidden pages under approved sources can be recovered into the owner queue');
assert.match(crawler, /knowledge_page_recovered_for_review/, 'a hidden page missing its original staging event gets a recovery audit before review');
assert.match(crawler, /const stagedContentHash = stageEvent\?\.metadata\?\.content_hash \|\| page\.content_hash \|\| null/, 'recovery review tolerates a missing original staging event');
assert.match(crawler, /metadata: \{ page_id: pageId, reviewed_by: user\.id, reviewed_at: reviewedAt, content_hash: stagedContentHash \}/, 'review audit uses the recovered or staged page hash');

assert.match(crawler, /checkedPageUrl\.protocol !== "https:"[\s\S]*checkedPageUrl\.hostname\.toLowerCase\(\) !== approvedDomain/, 'page review enforces standard HTTPS and exact approved host');

assert.match(crawler, /body\.confirm_review !== true/, 'publishing requires explicit human confirmation');
assert.match(crawler, /decision === "keep_hidden"/, 'review can explicitly leave a page hidden');
assert.match(crawler, /requestedUniversityId/, 'crawler scopes actions to the university selected by the owner');
assert.match(crawler, /from\("campus_crawler_events"\)[\s\S]*event_type: preservePublished \? "knowledge_page_unchanged" : "knowledge_page_staged"/, 'page staging is linked to the owner-only crawler event log');
assert.match(crawler, /from\("campus_crawler_runs"\)\.insert/, 'each knowledge crawl creates a private audit run');
assert.match(crawler, /event_type: "knowledge_page_published"/, 'owner page publication is saved to the audit log');
assert.match(crawler, /event_type: "knowledge_page_kept_hidden"/, 'owner decision to keep a page hidden is saved to the audit log');
assert.match(crawler, /body\.action === "list_pending_pages"[\s\S]*event_type", "knowledge_page_staged"/, 'pending list contains only pages with saved staging audit events');
assert.match(crawler, /if \(publishAuditError\)[\s\S]*update\(\{ status: "hidden"/, 'a failed publication audit attempts to return the page to hidden');
assert.match(crawler, /crawlerOwnerEmail/, 'crawler management remains server-checked against the trusted owner');

assert.match(crawler, /from\("campus_crawler_runs"\)\.insert/, 'each knowledge crawl creates an owner-only audit run');
assert.match(crawler, /from\("campus_crawler_events"\)\.insert/, 'crawled pages and review decisions produce audit events');
assert.match(crawler, /event_type: preservePublished \? "knowledge_page_unchanged" : "knowledge_page_staged"/, 'crawl events distinguish unchanged approved content from pages needing review');
assert.match(crawler, /event_type: "knowledge_page_published"/, 'publishing is recorded as an audit event');
assert.match(crawler, /if \(publishAuditError\)[\s\S]*update\(\{ status: "hidden"/, 'a failed publication audit attempts to return the page to hidden');

assert.match(html, /campus-knowledge-admin\.js/, 'owner knowledge-library UI is loaded');
assert.match(ui, /campus-knowledge-crawler/, 'knowledge review UI calls the dedicated crawler function');
assert.match(ui, /Approve and publish/, 'knowledge review UI requires an explicit publish action');
assert.match(ui, /new URL\(page\.url\)/, 'review UI validates link destinations before rendering');
console.log('PASS ShieldMind knowledge crawler review gate, unpublished staging and owner-only review actions');
