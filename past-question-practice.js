/* CampusShield AI — Past Questions & Exam Prep.
 * Authenticated, campus-scoped learning UI. Answer keys are never fetched by the browser;
 * the past-question Edge Function generates practice and marks submissions server-side.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {
    loaded: false, busy: false, context: null, papers: [], attempts: [],
    universities: [], directoryCoverage: null, directoryLoaded: false, directoryLoading: false, directoryVisible: 30,
    reviewer: false, quiz: null, timer: null, lastResult: null,
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
  const client = () => window.CampusShieldBackend?.client || null;
  // Keep the new tables and function confined to the staging project until the
  // authenticated flow is validated and the additive migration is approved for production.
  const STAGING_PROJECT_REF = "hywcpnoqqhxvujnimhxl";
  function isEnabled() {
    const url = String(window.CAMPUSSHIELD_SUPABASE_CONFIG?.url || "").toLowerCase();
    try {
      return new URL(url).hostname === STAGING_PROJECT_REF + ".supabase.co";
    } catch (_error) {
      return false;
    }
  }
  function applyEnvironmentGate() {
    const enabled = isEnabled();
    const nav = $("past-questions-nav");
    if (nav) nav.hidden = !enabled;
    if (!enabled) {
      ["pq-library-section", "pq-submit-section", "pq-ai-section", "pq-history-section", "pq-reviewer-tools", "pq-quiz-panel", "pq-result-panel", "pq-university-directory"]
        .forEach(id => { if ($(id)) $(id).hidden = true; });
      message("pq-page-status", "Past Questions & Exam Prep is enabled in staging while its authenticated workflows are validated. Production remains unchanged.");
    }
    return enabled;
  }

  function message(id, text, kind = "") {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.dataset.state = kind;
    el.classList.toggle("is-error", kind === "error");
    el.classList.toggle("is-success", kind === "success");
  }
  function currentUniversityName() {
    return state.context?.university?.name || state.context?.profile?.university_name || "your verified university";
  }
  function canReview() {
    return Boolean(state.context && state.reviewer);
  }
  function requireReady() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !backend.client) throw new Error("Supabase is not configured for this preview.");
    if (!state.context?.user?.id || !state.context?.universityId) throw new Error("Sign in with an active, verified campus account first.");
  }
  async function errorMessage(error, fallback) {
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json();
        if (typeof body?.error === "string") return body.error;
      }
    } catch (_error) {}
    return error?.message || fallback;
  }

  async function resolveContext(profileHint) {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !backend.client) throw new Error("Past Questions & Exam Prep needs the Supabase backend.");
    const db = backend.client;
    const { data: authData, error: authError } = await db.auth.getUser();
    if (authError || !authData?.user) throw new Error("Sign in to access your university's exam-preparation library.");
    const user = authData.user;
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("id,role,verification_status")
      .eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Your campus profile could not be loaded. Sign in again.");

    const { data: memberships, error: membershipError } = await db.from("campus_memberships")
      .select("university_id,campus_role,membership_status,verification_status,faculty,department,course,year_of_study,updated_at")
      .eq("user_id", user.id)
      .eq("membership_status", "active")
      .eq("verification_status", "verified")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (membershipError) throw membershipError;
    const membershipList = Array.isArray(memberships) ? memberships : [];
    const membership = membershipList[0] || null;
    if (profile.verification_status !== "verified" || !membership) {
      state.context = { user, profile, membership: null, universityId: null, university: null, hint: profileHint };
      return state.context;
    }
    const { data: university, error: universityError } = await db.from("campus_universities")
      .select("id,name,official_website").eq("id", membership.university_id).maybeSingle();
    if (universityError) {
      // Do not turn an institution-directory read failure into a cross-campus fallback.
      console.warn("Exam-prep university label could not be read.");
    }
    const role = String(profile.role || "");
    const campusRole = String(membership.campus_role || "");
    state.context = {
      user, profile, membership, universityId: membership.university_id,
      university: university || { id: membership.university_id, name: "" },
      hint: profileHint,
    };
    state.reviewer = profile.verification_status === "verified"
      && ["teacher", "security", "admin"].includes(role)
      && ["teacher", "security", "admin"].includes(campusRole);
    return state.context;
  }

  function renderContext() {
    const ctx = state.context;
    const name = currentUniversityName();
    const label = $("pq-campus-label");
    if (label) label.textContent = ctx?.universityId ? name : "Verification needed";
    if (ctx?.membership?.department) {
      if ($("pq-ai-department") && !$("pq-ai-department").value) $("pq-ai-department").value = ctx.membership.department;
      if ($("pq-submit-department") && !$("pq-submit-department").value) $("pq-submit-department").value = ctx.membership.department;
    }
    const gate = $("pq-access-gate");
    const ready = Boolean(ctx?.universityId && ctx?.membership && ctx?.profile?.verification_status === "verified");
    if (gate) {
      gate.hidden = ready;
      gate.textContent = "Past Questions & Exam Prep is campus-restricted. Sign in with an account that has completed identity, university, and active membership verification. No leaked or unreleased examinations are accepted.";
    }
    ["pq-library-section", "pq-submit-section", "pq-ai-section", "pq-history-section"].forEach(id => {
      if ($(id)) $(id).hidden = !ready;
    });
    if ($("pq-reviewer-tools")) $("pq-reviewer-tools").hidden = !(ready && canReview());
    if (!ready) {
      message("pq-page-status", "Verify your campus account to access authorized papers and practice results.", "error");
    } else {
      message("pq-page-status", name + " · Search reviewed papers, start a practice exam, or generate clearly labelled AI practice.", "success");
    }
    const intro = $("pq-pilot-note");
    if (intro) {
      intro.textContent = name.toLowerCase().includes("babcock")
        ? "Babcock University pilot · Your library is restricted to reviewed Babcock papers. AI-generated questions are labelled separately."
        : "Babcock University is the first pilot target. Your library is currently scoped to " + name + "; other universities' private submissions are not exposed.";
    }
  }

  function safeDirectoryUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function universityCoverageRows(universityId) {
    if (!Array.isArray(state.directoryCoverage)) return [];
    return state.directoryCoverage.filter(row => String(row.university_id) === String(universityId));
  }

  async function loadUniversityDirectory() {
    if (state.directoryLoaded || state.directoryLoading || !isEnabled()) return;
    state.directoryLoading = true;
    message("pq-university-status", "Loading active universities and approved-paper coverage…");
    try {
      const backend = window.CampusShieldBackend;
      if (!backend?.listCampusUniversities) throw new Error("The campus directory is not available in this preview.");
      const data = await backend.listCampusUniversities();
      state.universities = (Array.isArray(data) ? data : [])
        .filter(university => university?.id && university?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));

      // This RPC returns aggregate counts only, never files, source URLs, pending submissions,
      // answer keys, or submitter identities.
      state.directoryCoverage = null;
      try {
        const { data: coverage, error } = await client().rpc("get_past_question_coverage");
        if (error) throw error;
        state.directoryCoverage = Array.isArray(coverage) ? coverage : [];
      } catch (coverageError) {
        console.warn("Nationwide past-question coverage is not available yet:", coverageError?.message || "RPC unavailable");
      }

      const stateSelect = $("pq-university-state");
      if (stateSelect) {
        const selected = stateSelect.value;
        const states = [...new Set(state.universities.map(university => clean(university.state, 80)).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        stateSelect.innerHTML = '<option value="">All states and FCT</option>'
          + states.map(value => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>').join("");
        if (states.includes(selected)) stateSelect.value = selected;
      }
      state.directoryLoaded = true;
      renderUniversityDirectory();
    } catch (error) {
      state.directoryLoaded = true;
      const count = $("pq-university-directory-count");
      if (count) count.textContent = "Directory unavailable";
      message("pq-university-status", "CampusShield could not load the directory just now. Verify institutions through the National Universities Commission directory linked below.", "error");
      const results = $("pq-university-results");
      if (results) results.innerHTML = '<div class="pq-empty"><strong>Directory temporarily unavailable</strong><p>Refresh the page to try again, or use the official NUC directory below.</p></div>';
      console.warn("Nationwide university directory failed to load:", error?.message || "unknown error");
    } finally {
      state.directoryLoading = false;
    }
  }

  function renderUniversityDirectory(resetVisible = false) {
    const results = $("pq-university-results");
    if (!results) return;
    if (resetVisible) state.directoryVisible = 30;

    const term = clean($("pq-university-search")?.value, 160).toLocaleLowerCase();
    const ownership = clean($("pq-university-ownership")?.value, 30);
    const stateFilter = clean($("pq-university-state")?.value, 80);
    const filtered = state.universities.filter(university => {
      const search = [university.name, university.state, university.ownership, university.slug].join(" ").toLocaleLowerCase();
      return (!term || search.includes(term))
        && (!ownership || university.ownership === ownership)
        && (!stateFilter || university.state === stateFilter);
    });
    const count = $("pq-university-directory-count");
    if (count) count.textContent = state.universities.length.toLocaleString() + " active universities";
    const coveredCount = state.directoryCoverage
      ? new Set(state.directoryCoverage.filter(row => Number(row.approved_paper_count || 0) > 0).map(row => String(row.university_id))).size
      : null;
    const coverageNote = coveredCount === null
      ? "Coverage totals are temporarily unavailable."
      : coveredCount.toLocaleString() + " institution(s) currently have approved authentic paper records.";
    message("pq-university-status",
      filtered.length.toLocaleString() + " of " + state.universities.length.toLocaleString() + " active universities match. " + coverageNote,
      state.directoryCoverage ? "" : "error");

    if (!filtered.length) {
      results.innerHTML = '<div class="pq-empty"><strong>No universities match this search</strong><p>Try another spelling, ownership type or state.</p></div>';
      return;
    }

    const visible = filtered.slice(0, state.directoryVisible);
    const currentId = state.context?.universityId ? String(state.context.universityId) : "";
    results.innerHTML = visible.map(university => {
      const records = universityCoverageRows(university.id);
      const knownCoverage = Array.isArray(state.directoryCoverage);
      const approvedCount = knownCoverage ? records.reduce((sum, row) => sum + Number(row.approved_paper_count || 0), 0) : 0;
      const courses = [...new Map(records.filter(row => row.course_code)
        .map(row => [String(row.course_code).toUpperCase(), String(row.course_title || "")])).entries()];
      const isCurrent = currentId && currentId === String(university.id);
      let coverageLabel = "Coverage not loaded";
      let coverageClass = "is-unknown";
      let coverageDetail = "Approved-paper coverage could not be checked just now.";
      if (knownCoverage && approvedCount > 0) {
        coverageLabel = approvedCount + " approved paper" + (approvedCount === 1 ? "" : "s");
        coverageClass = "";
        coverageDetail = courses.length + " course(s) represented by reviewed, permission-confirmed papers.";
      } else if (knownCoverage) {
        coverageLabel = "No approved papers yet";
        coverageClass = "is-empty";
        coverageDetail = "No approved, permission-confirmed authentic paper records are currently counted.";
      }
      const courseTags = courses.slice(0, 4).map(([code]) => '<span class="pq-course-tag">' + escapeHtml(code) + '</span>').join("");
      const moreCourses = courses.length > 4 ? '<span class="pq-course-tag">+' + (courses.length - 4) + ' more</span>' : "";
      const website = safeDirectoryUrl(university.official_website);
      const action = isCurrent
        ? '<button type="button" class="btn" data-pq-directory-library="' + escapeHtml(university.id) + '">View your library</button>'
        : '<button type="button" class="btn secondary" data-pq-directory-access="' + escapeHtml(university.id) + '">Access details</button>';
      return '<article class="pq-university-card">'
        + '<div class="pq-university-card-top"><span class="pq-university-kind">' + escapeHtml(university.ownership || "University") + '</span>'
        + '<span class="pq-university-coverage ' + coverageClass + '">' + escapeHtml(coverageLabel) + '</span></div>'
        + '<h3>' + escapeHtml(university.name) + '</h3>'
        + '<p class="pq-university-meta">' + escapeHtml(university.state || "Nigeria") + (isCurrent ? " · Your verified campus" : "") + '</p>'
        + '<p class="pq-university-coverage-detail">' + escapeHtml(coverageDetail) + '</p>'
        + (courses.length ? '<div class="pq-course-tags" aria-label="Courses with approved papers">' + courseTags + moreCourses + '</div>' : "")
        + '<div class="pq-university-card-actions">' + action
        + (website ? '<a class="btn secondary" href="' + escapeHtml(website) + '" target="_blank" rel="noopener noreferrer">Official website ↗</a>' : "")
        + '</div></article>';
    }).join("");

    if (filtered.length > visible.length) {
      results.insertAdjacentHTML("beforeend",
        '<button type="button" class="btn secondary pq-university-more" data-pq-directory-more>Load ' +
        Math.min(30, filtered.length - visible.length) + ' more (' + (filtered.length - visible.length) + ' remaining)</button>');
    }
  }

  function handleUniversityDirectoryClick(event) {
    const more = event.target.closest("[data-pq-directory-more]");
    if (more) {
      state.directoryVisible += 30;
      renderUniversityDirectory();
      return;
    }
    const libraryButton = event.target.closest("[data-pq-directory-library]");
    if (libraryButton) {
      $("pq-library-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const accessButton = event.target.closest("[data-pq-directory-access]");
    if (accessButton) {
      const university = state.universities.find(item => String(item.id) === String(accessButton.dataset.pqDirectoryAccess));
      if (university) {
        message("pq-university-status",
          "Access to " + university.name + " papers requires an active, verified campus membership for that institution. Selecting it here does not change your verified campus or unlock private papers.");
      }
    }
  }

  async function load(profileHint) {
    if (!applyEnvironmentGate()) return;
    // Load the public directory independently so it remains useful before a student signs in.
    loadUniversityDirectory();
    try {
      await resolveContext(profileHint);
      renderContext();
      if (!state.context?.universityId) {
        state.papers = [];
        state.attempts = [];
        return;
      }
      await Promise.all([refreshLibrary(), refreshHistory()]);
      if (canReview()) await refreshReviewerQueue();
      state.loaded = true;
    } catch (error) {
      state.context = null;
      state.reviewer = false;
      renderContext();
      message("pq-page-status", error?.message || "Exam-preparation data could not be loaded.", "error");
    }
  }

  async function refreshLibrary() {
    requireReady();
    const db = client();
    message("pq-library-status", "Loading reviewed papers for " + currentUniversityName() + "…");
    const { data, error } = await db.from("past_question_papers")
      .select("id,university_id,department,course_code,course_title,academic_level,semester,exam_year,title,source_type,source_url,paper_path,rights_confirmed,status,submitted_by,created_at")
      .eq("university_id", state.context.universityId)
      .order("exam_year", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    state.papers = Array.isArray(data) ? data : [];
    renderLibrary();
    message("pq-library-status", state.papers.length
      ? state.papers.length + " authorized paper record(s) are available to your verified campus account."
      : "No paper records have been reviewed for this campus yet. Submit material only when you have permission to share it, or generate original practice questions.", state.papers.length ? "success" : "");
    populateReviewerPaperOptions();
  }

  function renderLibrary() {
    const list = $("pq-library-cards");
    if (!list) return;
    const term = clean($("pq-filter-search")?.value, 100).toLowerCase();
    const year = clean($("pq-filter-year")?.value, 4);
    const level = clean($("pq-filter-level")?.value, 20);
    const semester = clean($("pq-filter-semester")?.value, 20);
    const filtered = state.papers.filter(paper => {
      const searchText = [paper.course_code, paper.course_title, paper.title, paper.department, paper.exam_year].join(" ").toLowerCase();
      return (!term || searchText.includes(term))
        && (!year || String(paper.exam_year) === year)
        && (!level || paper.academic_level === level)
        && (!semester || paper.semester === semester);
    });
    if (!filtered.length) {
      if (state.papers.length === 0) {
        list.innerHTML = '<div class="pq-empty"><span aria-hidden="true">⌕</span><strong>No reviewed past papers yet</strong><p>This campus library has no approved papers at the moment. Ask your department or library for materials that may be shared, contribute an authorized copy for review, or use original AI-generated practice below.</p><div class="pq-empty-actions"><button class="btn" type="button" data-pq-empty-contribute>Contribute a paper</button><button class="btn secondary" type="button" data-pq-empty-practice>Generate practice questions</button></div></div>';
      } else {
        list.innerHTML = '<div class="pq-empty"><span aria-hidden="true">⌕</span><strong>No matching papers</strong><p>Try another course code, year, level or semester. If a paper is missing, its upload may still be awaiting review.</p></div>';
      }
      return;
    }
    list.innerHTML = filtered.map(paper => {
      const ai = paper.source_type === "ai_generated";
      const ownPending = paper.status === "pending";
      const rejected = paper.status === "rejected";
      const sourceType = ai ? "AI-generated practice" : paper.source_type === "student_submission" ? "Community submission" : "External / institutional source";
      return '<article class="pq-paper-card">'
        + '<div class="pq-paper-card-top"><span class="pq-chip ' + (ai ? "pq-chip-ai" : "pq-chip-verified") + '">' + (ai ? "✦ AI PRACTICE" : ownPending ? "IN REVIEW" : rejected ? "NOT APPROVED" : "REVIEWED PAPER") + '</span><span class="pq-paper-year">' + escapeHtml(paper.exam_year) + '</span></div>'
        + '<h3>' + escapeHtml(paper.title) + '</h3>'
        + '<p class="pq-paper-course"><strong>' + escapeHtml(paper.course_code) + '</strong> · ' + escapeHtml(paper.course_title) + '</p>'
        + '<div class="pq-paper-meta"><span>' + escapeHtml(paper.department) + '</span><span>Level ' + escapeHtml(paper.academic_level) + '</span><span>' + escapeHtml(paper.semester.replace("_", " ")) + ' semester</span></div>'
        + '<div class="pq-paper-source">' + escapeHtml(sourceType) + (ai ? ' · Original questions, not an authentic past paper' : '') + '</div>'
        + (ownPending ? '<p class="pq-paper-note">Awaiting authorized review. This item is not in the public campus library.</p>' : '')
        + (rejected ? '<p class="pq-paper-note">Not approved for student distribution.</p>' : '')
        + '<div class="pq-card-actions">'
        + (paper.status === "approved" ? '<button type="button" class="btn" data-pq-start="' + escapeHtml(paper.id) + '" data-pq-mode="practice">Practise</button><button type="button" class="btn secondary" data-pq-start="' + escapeHtml(paper.id) + '" data-pq-mode="timed">Timed exam</button>' : '')
        + (paper.status === "approved" && (paper.paper_path || paper.source_url) && !ai ? '<button type="button" class="btn secondary" data-pq-open="' + escapeHtml(paper.id) + '">Open paper ↗</button>' : '')
        + '</div></article>';
    }).join("");
  }

  async function openPaper(paperId) {
    const paper = state.papers.find(item => item.id === paperId);
    if (!paper || paper.status !== "approved") throw new Error("Only reviewed papers can be opened.");
    let url = paper.source_url;
    if (paper.paper_path) {
      const { data, error } = await client().storage.from("past-question-files").createSignedUrl(paper.paper_path, 600);
      if (error || !data?.signedUrl) throw new Error("The private PDF is not available to your account. Try again or contact the reviewer.");
      url = data.signedUrl;
    }
    if (!url || !/^https:\/\//i.test(url)) throw new Error("A secure paper link is not available.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function renderQuiz(paper, attempt, items, mode) {
    const panel = $("pq-quiz-panel");
    const form = $("pq-quiz-form");
    if (!panel || !form) return;
    const total = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
    state.quiz = { paper, attempt, items, mode, total, submitting: false, endsAt: Number(attempt.time_limit_seconds) > 0
      ? new Date(attempt.started_at).getTime() + Number(attempt.time_limit_seconds) * 1000 : null };
    $("pq-quiz-title").textContent = paper.title;
    $("pq-quiz-subtitle").textContent = paper.source_type === "ai_generated"
      ? "AI-generated practice · not an authentic past paper"
      : paper.course_code + " · " + paper.exam_year + " · " + items.length + " question(s)";
    $("pq-quiz-timer").textContent = mode === "timed" ? "Preparing timer…" : "Practice mode · no timer";
    $("pq-quiz-timer").classList.toggle("is-timed", mode === "timed");
    $("pq-quiz-questions").innerHTML = items.map((item, index) => {
      const prompt = '<div class="pq-question-title"><span>Q' + (index + 1) + '</span><div><strong>' + escapeHtml(item.topic || "General") + '</strong><small>' + escapeHtml(item.marks) + ' mark(s)</small></div></div><p class="pq-question-copy">' + escapeHtml(item.question_text).replace(/\n/g, "<br>") + '</p>';
      if (item.question_type === "mcq") {
        const options = Array.isArray(item.options) ? item.options : [];
        return '<article class="pq-question" data-pq-question="' + escapeHtml(item.id) + '">' + prompt
          + '<div class="pq-options">' + options.map((option, optionIndex) => {
            const inputId = "pq-" + item.id + "-" + optionIndex;
            return '<label for="' + escapeHtml(inputId) + '"><input id="' + escapeHtml(inputId) + '" type="radio" name="pq-answer-' + escapeHtml(item.id) + '" value="' + escapeHtml(option) + '"><span>' + escapeHtml(String.fromCharCode(65 + optionIndex)) + '</span><em>' + escapeHtml(option) + '</em></label>';
          }).join("") + '</div></article>';
      }
      return '<article class="pq-question" data-pq-question="' + escapeHtml(item.id) + '">' + prompt
        + '<label class="pq-written-label" for="pq-written-' + escapeHtml(item.id) + '">Your answer</label><textarea id="pq-written-' + escapeHtml(item.id) + '" data-pq-written="' + escapeHtml(item.id) + '" rows="4" maxlength="12000" placeholder="Show your reasoning and workings…"></textarea></article>';
    }).join("");
    $("pq-quiz-status").textContent = "Your answers and results are private to your account. Submit to see marking and explanations.";
    panel.hidden = false;
    $("pq-result-panel").hidden = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    updateTimer();
    if (state.timer) clearInterval(state.timer);
    if (state.quiz.endsAt) state.timer = setInterval(updateTimer, 1000);
  }

  async function startAttempt(paperId, mode) {
    requireReady();
    if (state.quiz?.attempt?.id) {
      if (!window.confirm("Leave the current attempt? Unsaved answers will be lost.")) return;
      clearQuizTimer();
      state.quiz = null;
    }
    const paper = state.papers.find(item => item.id === paperId);
    if (!paper || paper.status !== "approved") throw new Error("This reviewed paper is not available.");
    if (paper.source_type === "ai_generated" && paper.submitted_by !== state.context.user.id) {
      throw new Error("This AI-generated question set belongs to another account.");
    }
    const { data: items, error: itemsError } = await client().from("past_question_items")
      .select("id,sort_order,question_text,question_type,options,topic,marks")
      .eq("paper_id", paper.id).order("sort_order");
    if (itemsError) throw itemsError;
    if (!Array.isArray(items) || !items.length) {
      throw new Error("This paper has no structured questions yet. Open the source paper, or use AI practice while a reviewer prepares the question set.");
    }
    const total = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
    const limit = mode === "timed" ? Number($("pq-time-limit")?.value || 1800) : 0;
    const { data: attempt, error: attemptError } = await client().from("practice_attempts").insert({
      user_id: state.context.user.id,
      university_id: state.context.universityId,
      paper_id: paper.id,
      mode: mode === "timed" ? "timed" : "practice",
      time_limit_seconds: Number.isFinite(limit) ? Math.max(0, Math.min(3600, limit)) : 1800,
      question_count: items.length,
      total_marks: total,
    }).select("id,user_id,university_id,paper_id,mode,status,time_limit_seconds,question_count,total_marks,started_at").single();
    if (attemptError || !attempt) throw new Error(attemptError?.message || "A practice attempt could not be started. Check your verification status.");
    renderQuiz(paper, attempt, items, mode);
  }

  function updateTimer() {
    if (!state.quiz?.endsAt || !$("pq-quiz-timer")) return;
    const seconds = Math.max(0, Math.ceil((state.quiz.endsAt - Date.now()) / 1000));
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsText = String(seconds % 60).padStart(2, "0");
    $("pq-quiz-timer").textContent = "Time remaining · " + minutesText + ":" + secondsText;
    if (seconds <= 0 && state.quiz && !state.quiz.submitting) {
      message("pq-quiz-status", "Time is up. Submitting your current answers…");
      submitQuiz();
    }
  }
  function clearQuizTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  async function submitQuiz() {
    const quiz = state.quiz;
    if (!quiz || quiz.submitting) return;
    quiz.submitting = true;
    clearQuizTimer();
    const submit = $("pq-quiz-submit");
    if (submit) submit.disabled = true;
    message("pq-quiz-status", "Marking your answers and saving your result…");
    try {
      const answers = quiz.items.map(item => {
        let response = "";
        if (item.question_type === "mcq") {
          const selected = document.querySelector('input[name="pq-answer-' + CSS.escape(item.id) + '"]:checked');
          response = selected?.value || "";
        } else {
          response = $("pq-written-" + item.id)?.value || "";
        }
        return { question_id: item.id, response };
      });
      const { data, error } = await client().functions.invoke("past-question-practice", {
        body: { action: "mark", attempt_id: quiz.attempt.id, answers },
      });
      if (error) throw new Error(await errorMessage(error, "The marking service is temporarily unavailable."));
      if (data?.error) throw new Error(String(data.error));
      state.lastResult = data;
      renderResult(data, quiz);
      state.quiz = null;
      message("pq-quiz-status", "Attempt submitted successfully.", "success");
      refreshHistory().catch(error => console.warn("Practice history refresh failed:", error?.message || "unavailable"));
    } catch (error) {
      // Keep the attempt visible so the student can retry after a temporary network/service error.
      quiz.submitting = false;
      message("pq-quiz-status", error?.message || "Could not submit the attempt.", "error");
      if (quiz.endsAt && quiz.endsAt <= Date.now()) message("pq-quiz-status", "The timer ended but marking is temporarily unavailable. Retry submission; your answers remain on this page.", "error");
      if (submit) submit.disabled = false;
      return;
    }
    if (submit) submit.disabled = false;
  }

  function renderResult(data, quiz) {
    const panel = $("pq-result-panel");
    if (!panel) return;
    panel.hidden = false;
    const attempt = data.attempt || {};
    const total = Number(attempt.total_marks || quiz.total || 0);
    const earned = Number(attempt.earned_marks || 0);
    const percent = Number(attempt.percent || 0);
    $("pq-result-summary").innerHTML = '<div class="pq-result-score"><span>YOUR RESULT</span><strong>' + escapeHtml(percent.toFixed(1)) + '%</strong><small>' + escapeHtml(earned) + ' / ' + escapeHtml(total) + ' marks</small></div>'
      + '<p>' + (attempt.mode === "timed" ? "Timed exam" : "Practice mode") + (attempt.late_submission ? " · Submitted after the configured limit" : "") + '</p>'
      + (Number(data.needs_review) > 0 ? '<p class="pq-review-callout">' + escapeHtml(data.needs_review) + ' written/unsupported answer(s) need lecturer review or an available AI marker. These are not included in the score yet.</p>' : '<p>Review the explanations and identify topics to practise next.</p>');
    $("pq-result-answers").innerHTML = (data.answers || []).map((answer, index) => {
      const awarded = answer.awarded_marks === null || answer.awarded_marks === undefined ? "Pending" : answer.awarded_marks + " / " + answer.maximum_marks;
      return '<article class="pq-result-answer"><div class="pq-result-answer-heading"><strong>Question ' + (index + 1) + '</strong><span>' + escapeHtml(awarded) + '</span></div>'
        + '<p>' + escapeHtml(answer.feedback || "") + '</p>'
        + (answer.correct_answer ? '<div class="pq-answer-key"><strong>Answer guide</strong><p>' + escapeHtml(answer.correct_answer) + '</p></div>' : '')
        + (answer.explanation ? '<div class="pq-answer-key"><strong>Explanation</strong><p>' + escapeHtml(answer.explanation) + '</p></div>' : '')
        + (answer.marking_status === "needs_review" ? '<small class="pq-result-pending">Needs review</small>' : '') + '</article>';
    }).join("");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function generatePractice(event) {
    event.preventDefault();
    requireReady();
    const form = $("pq-ai-form");
    if (!form?.reportValidity()) return;
    const button = $("pq-ai-generate");
    if (button) button.disabled = true;
    message("pq-ai-status", "ShieldMind is creating original questions and a private answer key…");
    try {
      const payload = {
        action: "generate",
        course_code: $("pq-ai-course-code").value,
        course_title: $("pq-ai-course-title").value,
        academic_level: $("pq-ai-level").value,
        department: $("pq-ai-department").value,
        topic: $("pq-ai-topic").value,
        question_count: Number($("pq-ai-count").value || 5),
      };
      const { data, error } = await client().functions.invoke("past-question-practice", { body: payload });
      if (error) throw new Error(await errorMessage(error, "ShieldMind could not generate this practice set."));
      if (data?.error) throw new Error(String(data.error));
      if (!data?.paper?.id) throw new Error("The practice set was not saved. Try again.");
      message("pq-ai-status", "Saved " + (data.questions?.length || 0) + " original questions. This set is labelled AI-generated, not an authentic past paper.", "success");
      await refreshLibrary();
      await startAttempt(data.paper.id, "practice");
    } catch (error) {
      message("pq-ai-status", error?.message || "Practice generation failed.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function submitPaper(event) {
    event.preventDefault();
    requireReady();
    const form = $("pq-submit-form");
    if (!form?.reportValidity()) return;
    const file = $("pq-paper-file")?.files?.[0] || null;
    const sourceUrl = clean($("pq-paper-url")?.value, 2048);
    if (!file && !sourceUrl) {
      message("pq-submit-status", "Attach a PDF or provide an HTTPS source link.", "error");
      return;
    }
    if (file && (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024)) {
      message("pq-submit-status", "Use one PDF file of 10 MiB or less.", "error");
      return;
    }
    if (sourceUrl && !/^https:\/\/\S+$/i.test(sourceUrl)) {
      message("pq-submit-status", "Source links must use HTTPS.", "error");
      return;
    }
    if (!$("pq-rights-confirm")?.checked) {
      message("pq-submit-status", "Confirm that you have permission to share this material.", "error");
      return;
    }
    const button = $("pq-submit-button");
    if (button) button.disabled = true;
    let filePath = null;
    message("pq-submit-status", "Submitting the paper securely for review…");
    try {
      if (file) {
        filePath = state.context.user.id + "/" + crypto.randomUUID() + ".pdf";
        const { error: uploadError } = await client().storage.from("past-question-files").upload(filePath, file, {
          contentType: "application/pdf", upsert: false, cacheControl: "3600",
        });
        if (uploadError) throw uploadError;
      }
      const sourceType = file ? "student_submission" : "official_source";
      const record = {
        university_id: state.context.universityId,
        department: $("pq-submit-department").value,
        course_code: clean($("pq-submit-code").value, 32).toUpperCase(),
        course_title: $("pq-submit-course").value,
        academic_level: $("pq-submit-level").value,
        semester: $("pq-submit-semester").value,
        exam_year: Number($("pq-submit-year").value),
        title: $("pq-submit-title").value,
        source_type: sourceType,
        source_url: sourceUrl || null,
        paper_path: filePath,
        rights_confirmed: true,
        rights_note: clean($("pq-submit-rights-note").value, 1200) || "Submitter confirmed permission for campus review.",
        submitted_by: state.context.user.id,
      };
      const { error } = await client().from("past_question_papers").insert(record);
      if (error) throw error;
      form.reset();
      message("pq-submit-status", "Paper submitted to the private review queue. It will not appear in the campus library unless an authorized reviewer approves it.", "success");
      await refreshLibrary();
      if (canReview()) await refreshReviewerQueue();
    } catch (error) {
      if (filePath) {
        try { await client().storage.from("past-question-files").remove([filePath]); } catch (_cleanupError) {}
      }
      message("pq-submit-status", error?.message || "The paper could not be submitted.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function refreshHistory() {
    requireReady();
    const db = client();
    const { data, error } = await db.from("practice_attempts")
      .select("id,paper_id,mode,status,question_count,total_marks,earned_marks,percent,late_submission,started_at,submitted_at,created_at")
      .eq("user_id", state.context.user.id).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    state.attempts = Array.isArray(data) ? data : [];
    renderHistory();
  }
  async function renderHistory() {
    const list = $("pq-history-list");
    if (!list) return;
    if (!state.attempts.length) {
      list.innerHTML = '<div class="pq-empty"><span aria-hidden="true">◷</span><strong>No attempts yet</strong><p>Complete a practice set or a timed exam to start your progress history.</p></div>';
      $("pq-topic-weaknesses").innerHTML = '<p class="pq-muted">Topic recommendations will appear after you complete practice attempts.</p>';
      return;
    }
    const paperById = new Map(state.papers.map(paper => [paper.id, paper]));
    list.innerHTML = state.attempts.slice(0, 10).map(attempt => {
      const paper = paperById.get(attempt.paper_id);
      const score = Number.isFinite(Number(attempt.percent)) ? Number(attempt.percent).toFixed(1) + "%" : "Not marked";
      return '<article class="pq-history-row"><span class="pq-history-mark">' + (attempt.status === "submitted" ? escapeHtml(score) : "In progress") + '</span><div><strong>' + escapeHtml(paper?.title || "Past questions practice") + '</strong><small>' + escapeHtml(attempt.mode) + ' · ' + escapeHtml(attempt.question_count) + ' questions · ' + escapeHtml(new Date(attempt.created_at).toLocaleDateString()) + '</small></div><span class="pq-history-state">' + escapeHtml(attempt.status) + '</span></article>';
    }).join("");
    const submitted = state.attempts.filter(attempt => attempt.status === "submitted");
    const completedIds = submitted.slice(0, 20).map(attempt => attempt.id);
    if (!completedIds.length) {
      $("pq-topic-weaknesses").innerHTML = '<p class="pq-muted">Topic recommendations will appear after a submitted attempt.</p>';
      return;
    }
    const { data: answerRows, error } = await client().from("practice_answers")
      .select("attempt_id,topic_snapshot,awarded_marks,maximum_marks,marking_status")
      .in("attempt_id", completedIds).limit(1000);
    if (error) {
      $("pq-topic-weaknesses").innerHTML = '<p class="pq-muted">Topic analysis is temporarily unavailable.</p>';
      return;
    }
    const topicStats = new Map();
    (answerRows || []).forEach(answer => {
      const key = clean(answer.topic_snapshot, 160) || "General";
      const stats = topicStats.get(key) || { earned: 0, max: 0, marked: 0, pending: 0, attempts: new Set() };
      if (answer.awarded_marks === null || answer.awarded_marks === undefined) {
        stats.pending++;
      } else {
        stats.max += Number(answer.maximum_marks || 0);
        stats.earned += Number(answer.awarded_marks);
        stats.marked++;
      }
      stats.attempts.add(answer.attempt_id);
      topicStats.set(key, stats);
    });
    const topics = [...topicStats.entries()].map(([topic, stats]) => ({
      topic, ...stats, pct: stats.max ? (stats.earned / stats.max) * 100 : 0,
    })).sort((a, b) => a.pct - b.pct).slice(0, 6);
    $("pq-topic-weaknesses").innerHTML = topics.length ? topics.map(topic => {
      const percentage = topic.marked ? Math.round(topic.pct) : null;
      return '<div class="pq-topic-row"><div><strong>' + escapeHtml(topic.topic) + '</strong><small>' + topic.attempts.size + ' attempt(s)' + (topic.pending ? ' · ' + topic.pending + ' pending review' : '') + '</small></div><div class="pq-topic-progress"><span style="width:' + Math.max(0, Math.min(100, percentage ?? 0)) + '%"></span></div><b>' + (percentage === null ? "Pending" : percentage + "%") + '</b></div>';
    }).join("") : '<p class="pq-muted">Topic recommendations will appear after question responses are marked.</p>';
  }

  function populateReviewerPaperOptions() {
    const select = $("pq-item-paper");
    if (!select) return;
    const papers = state.papers.filter(paper => paper.status === "approved" || paper.status === "pending");
    const previous = select.value;
    select.innerHTML = '<option value="">Choose a reviewed or pending paper…</option>' + papers.map(paper =>
      '<option value="' + escapeHtml(paper.id) + '">' + escapeHtml(paper.course_code + " · " + paper.title + " (" + paper.status + ")") + '</option>'
    ).join("");
    if (papers.some(paper => paper.id === previous)) select.value = previous;
  }

  async function refreshReviewerQueue() {
    if (!canReview()) return;
    const { data, error } = await client().from("past_question_papers")
      .select("id,department,course_code,course_title,academic_level,semester,exam_year,title,source_type,source_url,paper_path,rights_confirmed,rights_note,status,submitted_by,created_at")
      .eq("university_id", state.context.universityId).eq("status", "pending")
      .order("created_at", { ascending: true }).limit(50);
    if (error) throw error;
    const queue = $("pq-review-queue");
    if (!queue) return;
    const papers = Array.isArray(data) ? data : [];
    if (!papers.length) {
      queue.innerHTML = '<div class="pq-empty"><span aria-hidden="true">✓</span><strong>Review queue is clear</strong><p>New submissions must be checked for permission, authenticity, correct course/year details, and exam confidentiality.</p></div>';
    } else {
      queue.innerHTML = papers.map(paper => '<article class="pq-review-card"><div><span class="pq-chip">PENDING REVIEW</span><h4>' + escapeHtml(paper.title) + '</h4><p>' + escapeHtml(paper.course_code + " · " + paper.course_title + " · " + paper.exam_year + " · Level " + paper.academic_level) + '</p><small>' + escapeHtml(paper.department) + ' · Rights attested: ' + (paper.rights_confirmed ? "Yes" : "No") + ' · ' + escapeHtml(paper.source_type) + '</small></div><div class="pq-review-card-actions"><input type="text" maxlength="1000" data-pq-review-note="' + escapeHtml(paper.id) + '" placeholder="Review note (optional)"><button type="button" class="btn" data-pq-review="' + escapeHtml(paper.id) + '" data-pq-decision="approved">Approve</button><button type="button" class="btn danger" data-pq-review="' + escapeHtml(paper.id) + '" data-pq-decision="rejected">Reject</button></div></article>'
      ).join("");
    }
    populateReviewerPaperOptions();
  }

  async function reviewPaper(paperId, decision) {
    if (!canReview()) throw new Error("Only an authorized reviewer at this university can review papers.");
    if (!["approved", "rejected"].includes(decision)) throw new Error("Invalid review decision.");
    const note = clean(document.querySelector('[data-pq-review-note="' + CSS.escape(paperId) + '"]')?.value, 1000);
    if (decision === "approved" && !window.confirm("Approve this paper for students at " + currentUniversityName() + "? Confirm source permission and exam confidentiality first.")) return;
    const { error } = await client().from("past_question_papers").update({
      status: decision,
      reviewed_by: state.context.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || (decision === "approved" ? "Approved after source and permission review." : "Not approved for campus distribution."),
      updated_at: new Date().toISOString(),
    }).eq("id", paperId).eq("university_id", state.context.universityId).select("id,status").single();
    if (error) throw error;
    message("pq-review-status", decision === "approved" ? "Paper approved for verified campus members." : "Paper rejected; it remains outside the student library.", "success");
    await refreshLibrary();
    await refreshReviewerQueue();
  }

  async function addQuestion(event) {
    event.preventDefault();
    if (!canReview()) throw new Error("Only an authorized reviewer can publish question and marking data.");
    const form = $("pq-item-form");
    if (!form?.reportValidity()) return;
    const paperId = $("pq-item-paper").value;
    const type = $("pq-item-type").value;
    const options = type === "mcq" ? clean($("pq-item-options").value, 2400).split("\n").map(line => line.trim()).filter(Boolean).slice(0, 6) : [];
    const answer = clean($("pq-item-answer").value, 6000);
    if (!paperId) throw new Error("Choose the paper this question belongs to.");
    if (type === "mcq" && (options.length < 2 || options.length > 6 || !options.some(option => option === answer))) {
      throw new Error("Multiple-choice questions need 2–6 options and an exact matching correct option.");
    }
    const paper = state.papers.find(item => item.id === paperId);
    if (!paper) throw new Error("The selected paper is no longer available.");
    const { count, error: countError } = await client().from("past_question_items")
      .select("id", { count: "exact", head: true }).eq("paper_id", paperId);
    if (countError) throw countError;
    const result = await client().rpc("add_past_question_item_with_answer_key", {
      p_paper_id: paperId,
      p_sort_order: (count || 0) + 1,
      p_question_text: $("pq-item-question").value,
      p_question_type: type,
      p_options: options,
      p_topic: $("pq-item-topic").value || "General",
      p_marks: Number($("pq-item-marks").value || 1),
      p_answer_text: answer,
      p_explanation: $("pq-item-explanation").value,
      p_grading_rubric: $("pq-item-rubric").value,
    });
    if (result.error) throw result.error;
    form.reset();
    message("pq-item-status", "Question and private marking key saved atomically. Students can only see the answer key after submitting a practice attempt.", "success");
    await refreshLibrary();
  }

  function wire() {
    applyEnvironmentGate();
    if (state.wired) return;
    state.wired = true;
    const scrollToPanel = id => $(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("pq-source-contribute")?.addEventListener("click", () => scrollToPanel("pq-submit-section"));
    $("pq-source-practice")?.addEventListener("click", () => scrollToPanel("pq-ai-section"));
    $("pq-university-search")?.addEventListener("input", () => renderUniversityDirectory(true));
    $("pq-university-ownership")?.addEventListener("change", () => renderUniversityDirectory(true));
    $("pq-university-state")?.addEventListener("change", () => renderUniversityDirectory(true));
    $("pq-university-results")?.addEventListener("click", handleUniversityDirectoryClick);
    $("pq-library-cards")?.addEventListener("click", event => {
      if (event.target.closest("[data-pq-empty-contribute]")) scrollToPanel("pq-submit-section");
      if (event.target.closest("[data-pq-empty-practice]")) scrollToPanel("pq-ai-section");
    });
    $("pq-refresh")?.addEventListener("click", () => refreshLibrary().catch(error => message("pq-library-status", error?.message || "Could not refresh library.", "error")));
    ["pq-filter-search", "pq-filter-year", "pq-filter-level", "pq-filter-semester"].forEach(id => {
      $(id)?.addEventListener(id === "pq-filter-search" ? "input" : "change", renderLibrary);
    });
    $("pq-ai-form")?.addEventListener("submit", generatePractice);
    $("pq-submit-form")?.addEventListener("submit", submitPaper);
    $("pq-quiz-form")?.addEventListener("submit", event => { event.preventDefault(); submitQuiz(); });
    $("pq-quiz-cancel")?.addEventListener("click", () => {
      if (!window.confirm("Leave this attempt? Answers not submitted will be lost.")) return;
      clearQuizTimer(); state.quiz = null; $("pq-quiz-panel").hidden = true;
    });
    $("pq-review-refresh")?.addEventListener("click", () => refreshReviewerQueue().catch(error => message("pq-review-status", error?.message || "Review queue could not be loaded.", "error")));
    $("pq-item-form")?.addEventListener("submit", event => addQuestion(event).catch(error => message("pq-item-status", error?.message || "Question could not be added.", "error")));
    $("pq-item-type")?.addEventListener("change", () => {
      const mcq = $("pq-item-type").value === "mcq";
      $("pq-item-options-field").hidden = !mcq;
      $("pq-item-answer-label").textContent = mcq ? "Correct option (must match exactly) *" : "Model answer / marking guide *";
      $("pq-item-rubric-field").hidden = mcq;
    });
    $("pq-library-cards")?.addEventListener("click", event => {
      const start = event.target.closest("[data-pq-start]");
      const open = event.target.closest("[data-pq-open]");
      if (start) startAttempt(start.dataset.pqStart, start.dataset.pqMode).catch(error => message("pq-library-status", error?.message || "Could not start the quiz.", "error"));
      if (open) openPaper(open.dataset.pqOpen).catch(error => message("pq-library-status", error?.message || "Could not open the paper.", "error"));
    });
    $("pq-review-queue")?.addEventListener("click", event => {
      const button = event.target.closest("[data-pq-review]");
      if (!button) return;
      button.disabled = true;
      reviewPaper(button.dataset.pqReview, button.dataset.pqDecision)
        .catch(error => message("pq-review-status", error?.message || "Review action failed.", "error"))
        .finally(() => { button.disabled = false; });
    });
    $("pq-result-new-practice")?.addEventListener("click", () => $("pq-ai-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  document.addEventListener("DOMContentLoaded", wire);
  wire();
  window.PastQuestionPractice = { load, isEnabled };
})();
