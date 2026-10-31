/* Owner-only ShieldMind Knowledge Library controls.
 * Crawled pages stay hidden until an explicit owner review action publishes them.
 */
(() => {
  'use strict';
  const OWNER_EMAIL = 'campusshieldaitechnologies@gmail.com';
  const PANEL_ID = 'platform-knowledge-review-panel';
  const $ = id => document.getElementById(id);

  const markup = "    <section class=\"panel\" id=\"platform-knowledge-review-panel\" hidden>\n      <div class=\"panel-heading\">\n        <div><h2>ShieldMind Knowledge Library</h2><p>Register the university's official root website, fetch public pages, and review each new or changed page before publishing it to students.</p></div>\n        <button class=\"btn secondary\" type=\"button\" id=\"knowledge-review-refresh\">Refresh library</button>\n      </div>\n      <p class=\"muted\">Owner-only control. The selected university must also have an active, verified campus-admin membership for this account. Crawls are limited to HTTPS pages on the registered official domain and respect robots.txt.</p>\n      <div class=\"form-grid\">\n        <div class=\"field\"><label for=\"knowledge-source-title\">Official source name</label><input id=\"knowledge-source-title\" type=\"text\" value=\"Babcock University Official Website\" maxlength=\"160\"></div>\n        <div class=\"field\"><label for=\"knowledge-source-url\">Official root website</label><input id=\"knowledge-source-url\" type=\"url\" value=\"https://babcock.edu.ng/\" inputmode=\"url\"></div>\n      </div>\n      <div class=\"actions\">\n        <button class=\"btn\" type=\"button\" id=\"knowledge-source-add\">Register official source</button>\n      </div>\n      <div class=\"form-grid\">\n        <div class=\"field\"><label for=\"knowledge-source-select\">Registered source</label><select id=\"knowledge-source-select\"><option value=\"\">Choose a source</option></select></div>\n        <div class=\"field\"><label>Library status</label><p id=\"knowledge-library-summary\" class=\"muted\" aria-live=\"polite\">Choose a university to load its knowledge sources.</p></div>\n      </div>\n      <div class=\"actions\"><button class=\"btn secondary\" type=\"button\" id=\"knowledge-source-crawl\">Crawl up to 8 public pages</button></div>\n      <p id=\"knowledge-review-status\" class=\"message\" role=\"status\" aria-live=\"polite\">No crawler action has been started.</p>\n      <div class=\"knowledge-review-queue\">\n        <div class=\"panel-heading\"><div><h3>Pages waiting for review</h3><p>New or changed pages remain hidden from students until explicitly approved.</p></div><span id=\"knowledge-review-count\">0 pending</span></div>\n        <div id=\"knowledge-review-pages\" class=\"platform-service-crawler-results\"><p class=\"muted\">Select a university to load pending pages.</p></div>\n      </div>\n    </section>\n";

  function mountPanel() {
    const tools = $('platform-admin-tools');
    if (!tools) return;
    if (!$(PANEL_ID)) tools.insertAdjacentHTML('afterbegin', markup);
    if (tools.hidden) return;
    const panel = $(PANEL_ID);
    if (!panel || panel.dataset.initialized === 'true') return;

    const backend = window.CampusShieldBackend;
    if (!backend?.getCurrentUser) return;
    panel.dataset.initialized = 'true';
    backend.getCurrentUser().then(user => {
      const isOwner = String(user?.email || '').toLowerCase() === OWNER_EMAIL;
      panel.hidden = !isOwner;
      if (isOwner) wirePanel();
    }).catch(() => { panel.hidden = true; });
  }

  function selectedUniversity() {
    return $('platform-admin-university-select')?.value || '';
  }

  function setStatus(message, kind = 'info') {
    const target = $('knowledge-review-status');
    if (target) {
      target.textContent = message;
      target.dataset.kind = kind;
    }
  }

  async function invoke(action, extra = {}) {
    const universityId = selectedUniversity();
    if (!universityId) throw new Error('Choose the university above first.');
    const client = window.CampusShieldBackend?.client;
    if (!client) throw new Error('CampusShield is not connected to Supabase.');
    const { data, error } = await client.functions.invoke('campus-knowledge-crawler', {
      body: { action, university_id: universityId, ...extra }
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Knowledge crawler request failed.');
    return data || {};
  }

  function makeText(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(text || '');
    return node;
  }

  function renderSources(sources) {
    const select = $('knowledge-source-select');
    const old = select.value;
    select.replaceChildren(new Option('Choose a source', ''));
    for (const source of sources || []) {
      const option = new Option(source.title + ' · ' + source.status, source.id);
      option.disabled = source.status !== 'approved';
      select.appendChild(option);
    }
    if (sources?.some(source => source.id === old && source.status === 'approved')) select.value = old;
    if (!select.value) {
      const approved = (sources || []).find(source => source.status === 'approved');
      if (approved) select.value = approved.id;
    }
  }

  function renderPendingPages(pages) {
    const container = $('knowledge-review-pages');
    const count = $('knowledge-review-count');
    if (!container) return;
    const list = Array.isArray(pages) ? pages : [];
    if (count) count.textContent = list.length + ' pending';
    container.replaceChildren();
    if (!list.length) {
      container.appendChild(makeText('p', 'muted', 'No pages are waiting for review.'));
      return;
    }
    for (const page of list) {
      const card = document.createElement('article');
      card.className = 'platform-service-crawler-result';
      card.appendChild(makeText('h3', '', page.title || 'Official page'));
      let parsed = null;
      try { parsed = new URL(page.url); } catch {}
      if (parsed && parsed.protocol === 'https:') {
        const link = document.createElement('a');
        link.href = parsed.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = parsed.href;
        link.style.overflowWrap = 'anywhere';
        card.appendChild(link);
      }
      card.appendChild(makeText('small', 'muted', page.fetched_at ? 'Fetched: ' + new Date(page.fetched_at).toLocaleString() : 'Fetch time unavailable'));
      const excerpt = document.createElement('p');
      excerpt.className = 'knowledge-review-excerpt';
      excerpt.textContent = String(page.excerpt || '').slice(0, 1400);
      card.appendChild(excerpt);
      const actions = document.createElement('div');
      actions.className = 'crawler-candidate-actions';
      const publish = document.createElement('button');
      publish.type = 'button';
      publish.className = 'btn';
      publish.textContent = 'Approve and publish';
      publish.addEventListener('click', async () => {
        const confirmation = confirm('Have you opened and checked this official page? Publishing makes its content available to verified students at this university through ShieldMind.');
        if (!confirmation) return;
        publish.disabled = true;
        try {
          await invoke('review_page', { page_id: page.id, decision: 'publish', confirm_review: true });
          setStatus('Page approved and published: ' + page.title, 'success');
          await refreshLibrary();
        } catch (error) {
          setStatus(error.message || 'Page approval failed.', 'error');
          publish.disabled = false;
        }
      });
      actions.appendChild(publish);
      actions.appendChild(makeText('span', 'muted', 'Unapproved pages stay hidden; do not publish if the page is outdated or unclear.'));
      card.appendChild(actions);
      container.appendChild(card);
    }
  }

  async function refreshLibrary() {
    const universityId = selectedUniversity();
    if (!universityId) {
      setStatus('Choose a university in the Platform Administration selector.', 'warning');
      return;
    }
    setStatus('Loading approved sources and hidden pages…');
    const [sources, pending] = await Promise.all([
      invoke('list_sources'),
      invoke('list_pending_pages')
    ]);
    renderSources(sources.sources);
    renderPendingPages(pending.pages);
    const summary = $('knowledge-library-summary');
    if (summary) summary.textContent = (sources.sources || []).length + ' source(s) · ' + (sources.indexed_pages || 0) + ' total indexed page(s) · ' + (pending.pages || []).length + ' awaiting review';
    setStatus('Knowledge library refreshed.');
  }

  function wirePanel() {
    $('knowledge-review-refresh')?.addEventListener('click', () => refreshLibrary().catch(error => setStatus(error.message, 'error')));
    $('knowledge-source-add')?.addEventListener('click', async () => {
      const title = $('knowledge-source-title')?.value.trim() || '';
      const url = $('knowledge-source-url')?.value.trim() || '';
      if (!title || !url) { setStatus('Enter the official source name and root HTTPS website.', 'warning'); return; }
      if (!confirm('Register this root website as the official source for the selected university? The server will compare its domain with the university’s registered official website.')) return;
      try {
        const result = await invoke('add_source', { title, url, confirm_official: true });
        setStatus('Official source registered: ' + (result.source?.title || title), 'success');
        await refreshLibrary();
      } catch (error) { setStatus(error.message || 'Source registration failed.', 'error'); }
    });
    $('knowledge-source-crawl')?.addEventListener('click', async () => {
      const sourceId = $('knowledge-source-select')?.value || '';
      if (!sourceId) { setStatus('Choose an approved source before crawling.', 'warning'); return; }
      if (!confirm('Fetch up to 8 same-domain public HTML pages? New or changed pages will be saved as hidden and will not appear in student answers until reviewed and published.')) return;
      try {
        const result = await invoke('crawl_source', { source_id: sourceId });
        setStatus(result.message || ('Crawl finished: ' + result.saved + ' page(s) fetched; ' + result.pending_review + ' awaiting review.'), 'success');
        await refreshLibrary();
      } catch (error) { setStatus(error.message || 'Crawl failed.', 'error'); }
    });
    $('platform-admin-university-select')?.addEventListener('change', () => {
      refreshLibrary().catch(error => setStatus(error.message, 'error'));
    });
    if (selectedUniversity()) refreshLibrary().catch(error => setStatus(error.message, 'error'));
  }

  function observeAdminTools() {
    mountPanel();
    const tools = $('platform-admin-tools');
    if (!tools) return;
    new MutationObserver(mountPanel).observe(tools, { attributes: true, attributeFilter: ['hidden'] });
    $('platform-admin-university-select')?.addEventListener('change', () => {
      if (!tools.hidden && $(PANEL_ID)?.dataset.initialized === 'true') {
        // The panel's own change handler refreshes after the selector is updated.
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAdminTools, { once: true });
  else observeAdminTools();
})();
