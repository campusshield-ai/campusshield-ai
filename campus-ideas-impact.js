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
          <p>Good ideas deserve a path to action. Identify a problem, propose a practical solution and bring your campus together to make progress.</p>
        </div>
        <div class="cii-hero-mark" aria-hidden="true">✦</div>
      </div>
      <div class="cii-principles">
        <span><strong>01</strong> Describe the problem</span>
        <span><strong>02</strong> Propose a solution</span>
        <span><strong>03</strong> Build support and track progress</span>
      </div>
      <div class="cii-privacy-note"><strong>Campus-first privacy.</strong> Ideas are visible only to verified members of your university after review. You can choose campus, community, national or global impact as the ambition of your idea; the audience remains campus-only in this first release.</div>
      <div class="cii-layout">
        <section class="cii-compose" aria-labelledby="cii-compose-title">
          <div class="cii-section-heading">
            <div><span class="cii-eyebrow">YOUR NEXT BIG IDEA</span><h3 id="cii-compose-title">Propose an improvement</h3><p>Be specific, constructive and practical.</p></div>
          </div>
          <form id="cii-form">
            <div class="field">
              <label for="cii-title-input">Idea title *</label>
              <input id="cii-title-input" name="title" required minlength="5" maxlength="120" placeholder="e.g. Create a student-led campus recycling hub">
            </div>
            <div class="cii-form-row">
              <div class="field">
                <label for="cii-category">Category *</label>
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
                <label for="cii-scope">Intended impact *</label>
                <select id="cii-scope" name="impact_scope" required>
                  <option value="campus">Our campus</option>
                  <option value="local_community">Local community</option>
                  <option value="national">Nigeria</option>
                  <option value="global">Global</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="cii-problem">What problem should be solved? *</label>
              <textarea id="cii-problem" name="problem_statement" required minlength="20" maxlength="1800" rows="3" placeholder="Explain who is affected and why this matters. Do not include names or private incident details."></textarea>
            </div>
            <div class="field">
              <label for="cii-solution">What is your proposed solution? *</label>
              <textarea id="cii-solution" name="proposed_solution" required minlength="20" maxlength="1800" rows="3" placeholder="Describe the steps, resources or people needed to make it happen."></textarea>
            </div>
            <div class="field">
              <label for="cii-impact">What positive impact could it create? *</label>
              <textarea id="cii-impact" name="expected_impact" required minlength="10" maxlength="800" rows="2" placeholder="Describe the expected benefit and how success could be measured."></textarea>
            </div>
            <button class="btn cii-submit" type="submit" id="cii-submit">Submit idea for review</button>
            <p class="cii-form-status" id="cii-form-status" role="status" aria-live="polite">Student ideas are reviewed by verified campus staff before they appear to other students.</p>
          </form>
        </section>
        <section class="cii-board" aria-labelledby="cii-board-title">
          <div class="cii-section-heading cii-board-heading">
            <div><span class="cii-eyebrow">FROM IDEAS TO ACTION</span><h3 id="cii-board-title">Explore student ideas</h3><p>Support good proposals, join the discussion and follow their progress.</p></div>
            <button type="button" class="btn secondary" id="cii-refresh">Refresh</button>
          </div>
          <div class="cii-filters">
            <label class="cii-search-label" for="cii-search">Search ideas</label>
            <input id="cii-search" type="search" placeholder="Search a problem or solution">
            <div class="cii-filter-row">
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
              <label for="cii-status-filter">Progress</label>
              <select id="cii-status-filter">
                <option value="all">All visible ideas</option>
                <option value="published">Open for support</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="implemented">Implemented</option>
                <option value="pending">Awaiting review</option>
                <option value="declined">Not selected</option>
              </select>
              <label for="cii-sort">Sort</label>
              <select id="cii-sort"><option value="newest">Newest</option><option value="support">Most supported</option></select>
            </div>
          </div>
          <p class="cii-board-status" id="cii-status" role="status" aria-live="polite">Sign in with a verified campus account to load ideas.</p>
          <div class="cii-stats" id="cii-stats" hidden></div>
          <div class="cii-feed" id="cii-feed"><div class="cii-empty"><strong>Make the first move.</strong><p>Share a clear idea that could make student life, education or the wider community better.</p></div></div>
        </section>
      </div>
      <p class="cii-footer">Keep proposals respectful and solution-focused. Do not include private student information, personal accusations or sensitive incident evidence. Use private incident reporting for safety concerns that need immediate attention.</p>
    `;
    welcome.insertAdjacentElement("afterend", section);
    wire();
  }

  async function prepare() {
    const api = window.CampusShieldBackend;
    if (!api?.isConfigured || !api.client) throw new Error("CampusShield could not connect to the campus database.");
    const user = await api.getCurrentUser();
    if (!user) throw new Error("Sign in with your student or verified campus account to explore Ideas & Impact.");
    const campus = await api.getMyCampusContext();
    if (!campus?.university_id) throw new Error("Choose your university in CampusPulse before sharing an idea.");
    if (campus.membership_status !== "active" || campus.verification_status !== "verified") {
      throw new Error("Ideas & Impact requires an active, verified campus membership.");
    }
    const { data: profile, error } = await api.client.from("profiles")
      .select("role,verification_status")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.verification_status !== "verified") {
      throw new Error("Complete campus identity verification before using Ideas & Impact.");
    }
    const community = await api.getMyCommunityProfile();
    state.api = api;
    state.client = api.client;
    state.user = user;
    state.campus = campus;
    state.profile = profile;
    state.username = community?.username || "";
    state.staff = ["admin","security","teacher"].includes(profile.role);
    const form = $("#cii-form");
    if (form) {
      const controls = form.querySelectorAll("input,select,textarea,button");
      controls.forEach((control) => { control.disabled = !state.username; });
      $("#cii-form-status").textContent = state.username
        ? "Your idea will stay visible only to you and campus moderators until it is approved."
        : "Create your CampusPulse username before submitting an idea.";
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
    if (feed) {
      feed.replaceChildren(create("p","cii-empty","Loading ideas from your university…"));
    }
    try {
      await prepare();
      let request = state.client.from("campus_ideas")
        .select("id,user_id,creator_username,title,category,impact_scope,problem_statement,proposed_solution,expected_impact,status,support_count,created_at,updated_at")
        .eq("university_id", state.campus.university_id);
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
        setStatus("No ideas match these filters yet. Submit the first proposal and start the conversation.");
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
      const stats = $("#cii-stats");
      if (stats) {
        stats.hidden = false;
        stats.replaceChildren(
          create("span","","" + state.ideas.length + (state.ideas.length === 1 ? " idea" : " ideas")),
          create("span","","" + totalSupport + (totalSupport === 1 ? " support" : " supports")),
          create("span","",state.campus.university_name || "Your university")
        );
      }
      setStatus("Showing " + state.ideas.length + " idea" + (state.ideas.length === 1 ? "" : "s") + " for " + (state.campus.university_name || "your university") + ".");
    } catch (error) {
      if (feed) {
        feed.replaceChildren(create("div","cii-empty","Ideas & Impact is unavailable for this account right now."));
      }
      setStatus(error?.message || "Could not load student ideas.", true);
    } finally {
      state.loading = false;
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
    feed.replaceChildren();
    if (!visible.length) {
      const empty = create("div","cii-empty");
      empty.append(create("strong","","No matching ideas"),create("p","","Try another category or search term, or submit a new proposal."));
      feed.append(empty);
      return;
    }
    const commentsByIdea = groupBy(state.comments, "idea_id");
    const updatesByIdea = groupBy(state.updates, "idea_id");
    visible.forEach((idea) => feed.append(renderIdea(idea, commentsByIdea[idea.id] || [], updatesByIdea[idea.id] || [])));
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
    card.append(head,makeSection("The problem",idea.problem_statement),makeSection("Proposed solution",idea.proposed_solution),makeSection("Expected impact",idea.expected_impact));

    const latestUpdate = updates[0];
    if (latestUpdate?.note) {
      const note = create("p","cii-update-note");
      note.append(create("strong","","Campus update: "),document.createTextNode(latestUpdate.note));
      card.append(note);
    }

    const actionRow = create("div","cii-idea-actions");
    const canSupport = PUBLIC_STATUSES.includes(idea.status) && idea.user_id !== state.user?.id;
    const support = create("button",state.supported.has(idea.id) ? "btn cii-support is-supported" : "btn cii-support",
      (state.supported.has(idea.id) ? "Supported" : "Support idea") + " · " + Number(idea.support_count || 0));
    support.type = "button";
    support.dataset.ideaSupport = idea.id;
    support.disabled = !canSupport;
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
      const form = create("form","cii-comment-form");
      form.dataset.ideaCommentForm = idea.id;
      const input = create("textarea",""); input.required = true; input.minLength = 3; input.maxLength = 700; input.rows = 2;
      input.placeholder = "Add a helpful comment or offer to contribute…";
      const submit = create("button","btn secondary","Post comment"); submit.type = "submit";
      form.append(input,submit);
      discussion.append(form);
      card.append(discussion);
    } else if (idea.status === "pending") {
      card.append(create("p","cii-muted","This proposal is visible to you and campus moderators. Discussion opens after it is approved."));
    }

    if (state.staff) {
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
      $("#cii-form-status").textContent = "Idea submitted. It is private to you and campus moderators until approved.";
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
