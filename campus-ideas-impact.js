(() => {
  "use strict";

  const ROOT_ID = "campus-ideas-impact";
  const PUBLIC_STATUSES = ["published", "planned", "in_progress", "implemented"];
  const STATUS_LABELS = {
    pending: "Awaiting campus review",
    published: "Open for support",
    planned: "Planned",
    in_progress: "In progress",
    implemented: "Implemented",
    declined: "Not selected"
  };
  const CATEGORY_LABELS = {
    campus_facilities: "Campus facilities",
    learning_research: "Learning & research",
    student_wellbeing: "Student wellbeing",
    environment: "Environment",
    technology_innovation: "Technology & innovation",
    community_world: "Community & world",
    accessibility: "Accessibility & inclusion",
    safety: "Campus safety"
  };
  const SCOPE_LABELS = {
    campus: "Campus",
    local_community: "Local community",
    national: "Nigeria",
    global: "Global"
  };

  const state = {
    api: null,
    client: null,
    user: null,
    campus: null,
    profile: null,
    username: "",
    staff: false,
    canContribute: false,
    loading: false,
    ideas: [],
    comments: [],
    updates: [],
    supported: new Set(),
    category: "all",
    status: "all",
    sort: "newest"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const create = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  };

  function setStatus(message, isError = false) {
    const node = $("#cii-status");
    if (!node) return;
    node.textContent = message || "";
    node.dataset.state = isError ? "error" : "ok";
  }

  function friendlyTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Recently";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function makeSection(label, content) {
    const section = create("section", "cii-idea-section");
    section.append(create("h4", "", label), create("p", "", content));
    return section;
  }

  function mount() {
    const page = $("#page-community");
    const welcome = page?.querySelector(".campuspulse-welcome");
    if (!page || !welcome || $("#" + ROOT_ID)) return;

    const section = create("section", "panel campus-ideas-impact");
    section.id = ROOT_ID;
    section.setAttribute("aria-labelledby", "cii-title");
    section.innerHTML = `

      <div class="cii-hero">
        <div class="cii-hero-copy">
          <span class="cii-kicker">CAMPUSPULSE · STUDENT-LED CHANGE</span>
          <h2 id="cii-title">Ideas &amp; Impact</h2>
          <p>Discover approved ideas from across CampusShield, support promising solutions and follow the progress they make.</p>
          <div class="cii-hero-trust">
            <span><span class="cii-trust-dot" aria-hidden="true"></span>Explore ideas when signed in</span>
            <span>Verified campus members can contribute</span>
          </div>
        </div>
        <button type="button" class="btn cii-hero-cta" id="cii-start-idea"><span aria-hidden="true">＋</span> Share an idea</button>
      </div>

      <div class="cii-principles" aria-label="How Ideas and Impact works">
        <div class="cii-step"><span>01</span><div><strong>Spot a challenge</strong><small>Explain what needs to improve</small></div></div>
        <div class="cii-step"><span>02</span><div><strong>Suggest a solution</strong><small>Make the next step practical</small></div></div>
        <div class="cii-step"><span>03</span><div><strong>Build momentum</strong><small>Get support and track progress</small></div></div>
      </div>

      <div class="cii-privacy-note" role="note">
        <strong>How visibility works</strong>
        <span>Signed-in members can explore approved ideas across CampusShield. Verified campus members with a CampusPulse username can submit, support and comment. New proposals stay private to their author and university moderators until approved.</span>
      </div>

      <section class="cii-board" aria-labelledby="cii-board-title">
        <div class="cii-section-heading cii-board-heading">
          <div>
            <span class="cii-eyebrow">FROM IDEAS TO ACTION</span>
            <h3 id="cii-board-title">Explore student ideas</h3>
            <p>Find a solution worth supporting or join a constructive discussion.</p>
          </div>
          <button type="button" class="btn secondary cii-refresh" id="cii-refresh" aria-label="Refresh ideas">↻ <span>Refresh</span></button>
        </div>

        <div class="cii-filters" aria-label="Search and filter ideas">
          <div class="cii-search-field">
            <label class="cii-search-label" for="cii-search">Search ideas</label>
            <input id="cii-search" type="search" autocomplete="off" placeholder="Search titles, problems or solutions">
          </div>
          <div class="cii-filter-row">
            <div class="cii-filter-control">
              <label for="cii-category-filter">Category</label>
              <select id="cii-category-filter">
                <option value="all">All categories</option>
                <option value="campus_facilities">Campus facilities</option>
                <option value="learning_research">Learning &amp; research</option>
                <option value="student_wellbeing">Student wellbeing</option>
                <option value="environment">Environment</option>
                <option value="technology_innovation">Technology &amp; innovation</option>
                <option value="community_world">Community &amp; world</option>
                <option value="accessibility">Accessibility &amp; inclusion</option>
                <option value="safety">Campus safety</option>
              </select>
            </div>
            <div class="cii-filter-control">
              <label for="cii-status-filter">Progress</label>
              <select id="cii-status-filter">
                <option value="all">All ideas I can view</option>
                <option value="published">Open for support</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="implemented">Implemented</option>
                <option value="pending">Awaiting review</option>
                <option value="declined">Not selected</option>
              </select>
            </div>
            <div class="cii-filter-control">
              <label for="cii-sort">Sort by</label>
              <select id="cii-sort"><option value="newest">Newest first</option><option value="support">Most supported</option></select>
            </div>
            <button type="button" class="btn secondary cii-clear-filters" id="cii-clear-filters" hidden>Clear filters</button>
          </div>
        </div>

        <div class="cii-board-meta">
          <p class="cii-board-status" id="cii-status" role="status" aria-live="polite">Sign in to explore approved ideas from across CampusShield.</p>
          <p class="cii-results-count" id="cii-results-count" aria-live="polite">Loading ideas…</p>
        </div>
        <div class="cii-stats" id="cii-stats" hidden></div>
        <div class="cii-feed" id="cii-feed">
          <div class="cii-empty cii-loading" role="status"><span class="cii-loading-mark" aria-hidden="true"></span><strong>Loading ideas</strong><p>Finding the latest approved proposals across CampusShield.</p></div>
        </div>
      </section>

      <details class="cii-compose" id="cii-compose-details">
        <summary class="cii-compose-summary">
          <span class="cii-compose-mark" aria-hidden="true">＋</span>
          <span class="cii-compose-copy">
            <span class="cii-eyebrow">YOUR NEXT BIG IDEA</span>
            <strong>Have an improvement in mind?</strong>
            <small>Share the challenge, your proposed solution and the impact it could make.</small>
          </span>
          <span class="cii-compose-action">Start a proposal <span aria-hidden="true">↗</span></span>
        </summary>
        <div class="cii-compose-body">
          <div class="cii-section-heading">
            <div><span class="cii-eyebrow">PROPOSE AN IMPROVEMENT</span><h3 id="cii-compose-title">Turn your idea into a clear proposal</h3><p>Be specific, constructive and realistic. You can describe a small first step.</p></div>
          </div>
          <form id="cii-form">
            <div class="field">
              <label for="cii-title-input">Idea title <span aria-hidden="true">*</span></label>
              <input id="cii-title-input" name="title" required minlength="5" maxlength="120" placeholder="e.g. Create a student-led campus recycling hub">
              <div class="cii-field-meta"><span>Use a short, clear title.</span><span>5–120 characters</span></div>
            </div>
            <div class="cii-form-row">
              <div class="field">
                <label for="cii-category">Category <span aria-hidden="true">*</span></label>
                <select id="cii-category" name="category" required>
                  <option value="campus_facilities">Campus facilities</option>
                  <option value="learning_research">Learning &amp; research</option>
                  <option value="student_wellbeing">Student wellbeing</option>
                  <option value="environment">Environment</option>
                  <option value="technology_innovation">Technology &amp; innovation</option>
                  <option value="community_world">Community &amp; world</option>
                  <option value="accessibility">Accessibility &amp; inclusion</option>
                  <option value="safety">Campus safety</option>
                </select>
              </div>
              <div class="field">
                <label for="cii-scope">Where could it make an impact? <span aria-hidden="true">*</span></label>
                <select id="cii-scope" name="impact_scope" required>
                  <option value="campus">Our campus</option>
                  <option value="local_community">Local community</option>
                  <option value="national">Nigeria</option>
                  <option value="global">Global</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="cii-problem">What needs to improve? <span aria-hidden="true">*</span></label>
              <textarea id="cii-problem" name="problem_statement" required minlength="20" maxlength="1800" rows="3" placeholder="Who is affected, where does it happen, and why does it matter? Do not include names or private incident details."></textarea>
              <div class="cii-field-meta"><span>Explain the challenge, not a personal accusation.</span><span id="cii-problem-count">0 / 1,800</span></div>
            </div>
            <div class="field">
              <label for="cii-solution">What would you change? <span aria-hidden="true">*</span></label>
              <textarea id="cii-solution" name="proposed_solution" required minlength="20" maxlength="1800" rows="3" placeholder="Describe practical steps, people or resources that could help make it happen."></textarea>
              <div class="cii-field-meta"><span>A small, achievable first step is a good start.</span><span id="cii-solution-count">0 / 1,800</span></div>
            </div>
            <div class="field">
              <label for="cii-impact">How will we know it worked? <span aria-hidden="true">*</span></label>
              <textarea id="cii-impact" name="expected_impact" required minlength="10" maxlength="800" rows="2" placeholder="Describe the expected benefit and one way progress or success could be measured."></textarea>
              <div class="cii-field-meta"><span>Think about a visible result or useful measure.</span><span id="cii-impact-count">0 / 800</span></div>
            </div>
            <div class="cii-submit-row">
              <button class="btn cii-submit" type="submit" id="cii-submit">Submit for campus review <span aria-hidden="true">→</span></button>
              <p class="cii-form-status" id="cii-form-status" role="status" aria-live="polite">Your proposal stays private to you and moderators at your university until it is approved.</p>
            </div>
          </form>
        </div>
      </details>

      <p class="cii-footer">Keep proposals respectful and solution-focused. Do not include private student information, personal accusations or sensitive incident evidence. Use private incident reporting for safety concerns that need immediate attention.</p>

    `;
    welcome.insertAdjacentElement("afterend", section);
    wire();
  }

  async function prepare(options = {}) {
    const requireVerifiedCampus = options.requireVerifiedCampus !== false;
    const api = window.CampusShieldBackend;
    if (!api?.isConfigured || !api.client) throw new Error("CampusShield could not connect to the campus database.");
    const user = await api.getCurrentUser();
    if (!user) throw new Error("Sign in to explore Ideas & Impact across CampusShield.");

    let campus = null;
    try { campus = await api.getMyCampusContext(); } catch (_error) {}
    const { data: profile, error } = await api.client.from("profiles")
      .select("role,verification_status")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;

    let community = null;
    try { community = await api.getMyCommunityProfile(); } catch (_error) {}
    const verifiedCampus = !!(
      profile &&
      profile.verification_status === "verified" &&
      campus?.university_id &&
      campus.membership_status === "active" &&
      campus.verification_status === "verified"
    );

    state.api = api;
    state.client = api.client;
    state.user = user;
    state.campus = campus;
    state.profile = profile || null;
    state.username = community?.username || "";
    state.canContribute = verifiedCampus && !!state.username;
    state.staff = verifiedCampus && ["admin","security","teacher"].includes(profile?.role);
    if (requireVerifiedCampus && !state.canContribute) {
      throw new Error("Browsing is open to signed-in CampusShield members. Verify your campus membership and create a CampusPulse username to submit, support or discuss ideas.");
    }

    const form = $("#cii-form");
    if (form) {
      form.querySelectorAll("input,select,textarea,button").forEach((control) => {
        control.disabled = !state.canContribute;
      });
      $("#cii-form-status").textContent = state.canContribute
        ? "Your proposal stays private to you and moderators at your university until approved. Once published, it is visible across CampusShield."
        : "You can browse approved ideas. To submit, support or comment, verify your campus membership and create a CampusPulse username.";
    }
  }

  function groupBy(rows, key) {
    const result = Object.create(null);
    (rows || []).forEach((row) => {
      const value = row[key];
      if (!result[value]) result[value] = [];
      result[value].push(row);
    });
    return result;
  }

  async function loadIdeas() {
    if (state.loading) return;
    state.loading = true;
    const feed = $("#cii-feed");
    const refresh = $("#cii-refresh");
    const stats = $("#cii-stats");
    const resultsCount = $("#cii-results-count");
    if (refresh) {
      refresh.disabled = true;
      refresh.querySelector("span").textContent = "Refreshing";
    }
    if (stats) stats.hidden = true;
    if (resultsCount) resultsCount.textContent = "Loading ideas…";
    if (feed) {
      feed.replaceChildren(create("div","cii-empty cii-loading",
        "Loading the latest approved ideas across CampusShield…"));
    }
    setStatus("Loading approved ideas across CampusShield…");
    try {
      await prepare({ requireVerifiedCampus: false });
      let request = state.client.from("campus_ideas")
        .select("id,user_id,university_id,creator_username,title,category,impact_scope,problem_statement,proposed_solution,expected_impact,status,support_count,created_at,updated_at");
      if (state.category !== "all") request = request.eq("category", state.category);
      if (state.status !== "all") request = request.eq("status", state.status);
      request = state.sort === "support"
        ? request.order("support_count", { ascending: false }).order("created_at", { ascending: false })
        : request.order("created_at", { ascending: false });
      const { data: ideas, error } = await request.limit(60);
      if (error) throw error;
      state.ideas = Array.isArray(ideas) ? ideas : [];
      const ids = state.ideas.map((idea) => idea.id);
      if (!ids.length) {
        state.comments = [];
        state.updates = [];
        state.supported = new Set();
        render();
        setStatus(state.status === "all" && state.category === "all"
          ? "No approved ideas have been published yet. Be the first to share a constructive proposal."
          : "No ideas match these filters yet. Try clearing a filter or changing your search.");
        return;
      }
      const [commentsResult, updatesResult, supportsResult] = await Promise.all([
        state.client.from("campus_idea_comments")
          .select("id,idea_id,creator_username,body,created_at")
          .in("idea_id", ids).order("created_at", { ascending: true }).limit(300),
        state.client.from("campus_idea_status_updates")
          .select("id,idea_id,status,note,created_at")
          .in("idea_id", ids).order("created_at", { ascending: false }).limit(180),
        state.client.from("campus_idea_supports")
          .select("idea_id").eq("user_id", state.user.id).in("idea_id", ids)
      ]);
      if (commentsResult.error) throw commentsResult.error;
      if (updatesResult.error) throw updatesResult.error;
      if (supportsResult.error) throw supportsResult.error;
      state.comments = commentsResult.data || [];
      state.updates = updatesResult.data || [];
      state.supported = new Set((supportsResult.data || []).map((row) => row.idea_id));
      render();
      const totalSupport = state.ideas.reduce((total, idea) => total + Number(idea.support_count || 0), 0);
      if (stats) {
        stats.hidden = false;
        stats.replaceChildren(
          create("span","","" + state.ideas.length + (state.ideas.length === 1 ? " idea in this view" : " ideas in this view")),
          create("span","","" + totalSupport + (totalSupport === 1 ? " support on these ideas" : " supports on these ideas")),
          create("span","","Across CampusShield")
        );
      }
      setStatus("Showing ideas you can access across CampusShield. Verified campus members can support, comment and submit proposals.");
    } catch (error) {
      state.ideas = [];
      state.comments = [];
      state.updates = [];
      state.supported = new Set();
      if (feed) {
        const empty = create("div","cii-empty cii-error-state");
        empty.append(
          create("strong","","We couldn’t load the idea board"),
          create("p","",error?.message || "Check your connection and try refreshing.")
        );
        feed.replaceChildren(empty);
      }
      if (resultsCount) resultsCount.textContent = "Ideas unavailable";
      setStatus(error?.message || "Could not load student ideas.", true);
    } finally {
      state.loading = false;
      if (refresh) {
        refresh.disabled = false;
        refresh.querySelector("span").textContent = "Refresh";
      }
    }
  }

  function render() {
    const feed = $("#cii-feed");
    if (!feed) return;
    const search = ($("#cii-search")?.value || "").trim().toLocaleLowerCase();
    const visible = state.ideas.filter((idea) => {
      const text = [idea.title,idea.problem_statement,idea.proposed_solution,idea.expected_impact,CATEGORY_LABELS[idea.category]].join(" ").toLocaleLowerCase();
      return !search || text.includes(search);
    });
    const filtersActive = !!search || state.category !== "all" || state.status !== "all" || state.sort !== "newest";
    const clearButton = $("#cii-clear-filters");
    if (clearButton) clearButton.hidden = !filtersActive;
    const resultsCount = $("#cii-results-count");
    if (resultsCount) {
      resultsCount.textContent = visible.length === state.ideas.length
        ? visible.length + (visible.length === 1 ? " idea shown" : " ideas shown")
        : visible.length + " of " + state.ideas.length + " loaded ideas match";
    }
    feed.replaceChildren();
    if (!visible.length) {
      const empty = create("div","cii-empty");
      if (!state.ideas.length) {
        empty.append(
          create("strong","","No ideas to show yet"),
          create("p","",filtersActive
            ? "There are no ideas for this selection. Clear the filters to see more."
            : "No approved proposals have been published yet. Share a practical idea to start the conversation.")
        );
      } else {
        empty.append(
          create("strong","","No matching ideas"),
          create("p","","Try a different search term or clear one or more filters.")
        );
      }
      if (filtersActive) {
        const clear = create("button","btn secondary cii-empty-clear","Clear filters");
        clear.type = "button";
        clear.addEventListener("click",clearFilters);
        empty.append(clear);
      }
      feed.append(empty);
      return;
    }
    const commentsByIdea = groupBy(state.comments, "idea_id");
    const updatesByIdea = groupBy(state.updates, "idea_id");
    visible.forEach((idea) => feed.append(renderIdea(idea, commentsByIdea[idea.id] || [], updatesByIdea[idea.id] || [])));
  }

  function clearFilters() {
    const search = $("#cii-search");
    const category = $("#cii-category-filter");
    const status = $("#cii-status-filter");
    const sort = $("#cii-sort");
    if (search) search.value = "";
    if (category) category.value = "all";
    if (status) status.value = "all";
    if (sort) sort.value = "newest";
    state.category = "all";
    state.status = "all";
    state.sort = "newest";
    loadIdeas();
  }

  function renderIdea(idea, comments, updates) {
    const card = create("article","cii-idea-card");
    const head = create("div","cii-idea-head");
    const titleWrap = create("div","cii-idea-title-wrap");
    titleWrap.append(
      create("span","cii-category",CATEGORY_LABELS[idea.category] || "Student idea"),
      create("h3","",idea.title),
      create("p","cii-meta","@" + idea.creator_username + " · " + (SCOPE_LABELS[idea.impact_scope] || "Campus") + " · " + friendlyTime(idea.created_at))
    );
    const badge = create("span","cii-status cii-status-" + idea.status,STATUS_LABELS[idea.status] || idea.status);
    head.append(titleWrap,badge);
    card.append(head);

    const details = create("details","cii-idea-details");
    const detailsSummary = create("summary","cii-idea-details-summary");
    detailsSummary.append(
      create("span","","Read the problem, solution and expected impact"),
      create("span","cii-details-action","View details ＋")
    );
    details.append(detailsSummary,
      makeSection("The problem",idea.problem_statement),
      makeSection("Proposed solution",idea.proposed_solution),
      makeSection("Expected impact",idea.expected_impact)
    );
    details.addEventListener("toggle",() => {
      const action = details.querySelector(".cii-details-action");
      if (action) action.textContent = details.open ? "Hide details −" : "View details ＋";
    });
    card.append(details);

    const latestUpdate = updates[0];
    if (latestUpdate?.note) {
      const note = create("p","cii-update-note");
      note.append(create("strong","","Campus update: "),document.createTextNode(latestUpdate.note));
      card.append(note);
    }

    const actionRow = create("div","cii-idea-actions");
    const isSupported = state.supported.has(idea.id);
    const canSupport = state.canContribute && PUBLIC_STATUSES.includes(idea.status) && idea.user_id !== state.user?.id;
    const support = create("button",isSupported ? "btn cii-support is-supported" : "btn cii-support",
      (isSupported ? "Supported" : "Support idea") + " · " + Number(idea.support_count || 0));
    support.type = "button";
    support.dataset.ideaSupport = idea.id;
    support.disabled = !canSupport;
    support.setAttribute("aria-pressed",String(isSupported));
    support.title = !state.canContribute
      ? "Verify your campus membership and create a CampusPulse username to support ideas."
      : idea.user_id === state.user?.id
        ? "You cannot support your own proposal."
        : PUBLIC_STATUSES.includes(idea.status)
          ? (isSupported ? "Remove your support from this idea." : "Show support for this idea.")
          : "This idea is not open for support.";
    actionRow.append(support,create("span","cii-meta",comments.length + (comments.length === 1 ? " comment" : " comments")));
    card.append(actionRow);

    if (PUBLIC_STATUSES.includes(idea.status)) {
      const discussion = create("div","cii-discussion");
      discussion.append(create("h4","","Discussion"));
      const commentList = create("div","cii-comments");
      const recent = comments.slice(-4);
      if (!recent.length) commentList.append(create("p","cii-muted","No comments yet. Add a constructive thought or offer to help."));
      recent.forEach((comment) => {
        const item = create("article","cii-comment");
        item.append(create("strong","","@" + comment.creator_username),create("p","",comment.body),create("time","",friendlyTime(comment.created_at)));
        commentList.append(item);
      });
      discussion.append(commentList);
      if (state.canContribute) {
        const form = create("form","cii-comment-form");
        form.dataset.ideaCommentForm = idea.id;
        const input = create("textarea","");
        input.required = true; input.minLength = 3; input.maxLength = 700; input.rows = 2;
        input.placeholder = "Add a helpful comment or offer to contribute…";
        input.setAttribute("aria-label","Comment on " + idea.title);
        const submit = create("button","btn secondary","Post comment");
        submit.type = "submit";
        form.append(input,submit);
        discussion.append(form);
      } else {
        discussion.append(create("p","cii-muted","Verify your campus membership to join this discussion."));
      }
      card.append(discussion);
    } else if (idea.status === "pending") {
      card.append(create("p","cii-muted","This proposal is visible only to its author and moderators at the originating university. Discussion opens after approval."));
    }

    if (state.staff && state.campus?.university_id === idea.university_id) {
      const allowed = idea.status === "pending"
        ? ["published","declined"]
        : idea.status === "published"
          ? ["planned","in_progress","implemented","declined"]
          : idea.status === "planned"
            ? ["in_progress","implemented","declined"]
            : idea.status === "in_progress"
              ? ["planned","implemented","declined"]
              : idea.status === "declined" ? ["published"] : [];
      if (allowed.length) {
        const review = create("div","cii-review");
        review.append(create("strong","","Campus review and progress"));
        const controls = create("div","cii-review-controls");
        const select = create("select","");
        select.dataset.ideaNextStatus = idea.id;
        allowed.forEach((status) => select.add(new Option(STATUS_LABELS[status],status)));
        const note = create("input","");
        note.type = "text"; note.maxLength = 700; note.placeholder = "Optional update for students";
        note.setAttribute("aria-label","Optional progress update for " + idea.title);
        note.dataset.ideaReviewNote = idea.id;
        const action = create("button","btn secondary","Update status");
        action.type = "button"; action.dataset.ideaReview = idea.id;
        controls.append(select,note,action);
        review.append(controls);
        card.append(review);
      }
    }
    return card;
  }

  async function submitIdea(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#cii-submit");
    if (form.dataset.sending === "true") return;
    form.dataset.sending = "true";
    button.disabled = true;
    try {
      await prepare();
      if (!state.username) throw new Error("Create your CampusPulse username before submitting an idea.");
      const payload = {
        title: $("#cii-title-input").value.trim(),
        category: $("#cii-category").value,
        impact_scope: $("#cii-scope").value,
        problem_statement: $("#cii-problem").value.trim(),
        proposed_solution: $("#cii-solution").value.trim(),
        expected_impact: $("#cii-impact").value.trim()
      };
      const { error } = await state.client.from("campus_ideas").insert(payload);
      if (error) throw error;
      form.reset();
      $("#cii-form-status").textContent = "Idea submitted. It is private to you and moderators at your university until it is approved for the CampusShield-wide board."
      setStatus("Your proposal was submitted for campus review.");
      await loadIdeas();
    } catch (error) {
      $("#cii-form-status").textContent = error?.message || "Could not submit this idea.";
      setStatus(error?.message || "Could not submit this idea.", true);
    } finally {
      form.dataset.sending = "false";
      button.disabled = !state.username;
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.sending === "true") return;
    form.dataset.sending = "true";
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await prepare();
      const body = form.querySelector("textarea").value.trim();
      const { error } = await state.client.from("campus_idea_comments").insert({
        idea_id: form.dataset.ideaCommentForm,
        body
      });
      if (error) throw error;
      setStatus("Comment posted.");
      await loadIdeas();
    } catch (error) {
      setStatus(error?.message || "Could not post your comment.", true);
    } finally {
      form.dataset.sending = "false";
      if (button) button.disabled = false;
    }
  }

  async function toggleSupport(button) {
    const ideaId = button.dataset.ideaSupport;
    button.disabled = true;
    try {
      await prepare();
      if (state.supported.has(ideaId)) {
        const { error } = await state.client.from("campus_idea_supports")
          .delete().eq("idea_id",ideaId).eq("user_id",state.user.id);
        if (error) throw error;
      } else {
        const { error } = await state.client.from("campus_idea_supports")
          .insert({ idea_id: ideaId });
        if (error) throw error;
      }
      await loadIdeas();
    } catch (error) {
      setStatus(error?.message || "Could not update your support.", true);
      button.disabled = false;
    }
  }

  async function reviewIdea(button) {
    const ideaId = button.dataset.ideaReview;
    const select = $('[data-idea-next-status="' + ideaId + '"]');
    const note = $('[data-idea-review-note="' + ideaId + '"]');
    button.disabled = true;
    try {
      await prepare();
      const { error } = await state.client.from("campus_idea_status_updates").insert({
        idea_id: ideaId,
        status: select.value,
        note: note.value.trim() || null
      });
      if (error) throw error;
      setStatus("Idea status updated and recorded in its progress history.");
      await loadIdeas();
    } catch (error) {
      setStatus(error?.message || "Could not update this idea.", true);
      button.disabled = false;
    }
  }

  function wire() {
    const root = $("#" + ROOT_ID);
    $("#cii-form").addEventListener("submit",submitIdea);
    $("#cii-refresh").addEventListener("click",loadIdeas);
    $("#cii-search").addEventListener("input",render);
    $("#cii-category-filter").addEventListener("change",(event)=>{state.category=event.target.value;loadIdeas();});
    $("#cii-status-filter").addEventListener("change",(event)=>{state.status=event.target.value;loadIdeas();});
    $("#cii-sort").addEventListener("change",(event)=>{state.sort=event.target.value;loadIdeas();});
    $("#cii-clear-filters").addEventListener("click",clearFilters);
    $("#cii-start-idea").addEventListener("click",()=>{
      const panel = $("#cii-compose-details");
      if (!panel) return;
      panel.open = true;
      window.setTimeout(()=>{
        $("#cii-title-input")?.focus({preventScroll:true});
        panel.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",block:"start"});
      },0);
    });
    [
      ["#cii-problem","#cii-problem-count",1800],
      ["#cii-solution","#cii-solution-count",1800],
      ["#cii-impact","#cii-impact-count",800]
    ].forEach(([inputSelector,countSelector,limit])=>{
      const input = $(inputSelector);
      const count = $(countSelector);
      if (!input || !count) return;
      const update = ()=>{count.textContent = input.value.length.toLocaleString() + " / " + Number(limit).toLocaleString();};
      input.addEventListener("input",update);
      update();
    });
    root.addEventListener("submit",(event)=>{
      const form = event.target.closest("[data-idea-comment-form]");
      if (form) submitComment(event);
    });
    root.addEventListener("click",async(event)=>{
      const support = event.target.closest("[data-idea-support]");
      const review = event.target.closest("[data-idea-review]");
      if (support) await toggleSupport(support);
      else if (review) await reviewIdea(review);
    });
    document.addEventListener("click",(event)=>{
      if (event.target.closest("[data-page='community']")) window.setTimeout(loadIdeas,120);
    });
    window.addEventListener("campusshield:session-changed",()=>{
      state.user=null;state.campus=null;state.profile=null;state.username="";
      window.setTimeout(loadIdeas,100);
    });
  }

  function init() { mount(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
