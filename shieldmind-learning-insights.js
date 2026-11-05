/* CampusShield AI — ShieldMind Learning Intelligence.
 * Read-only, student-private progress summaries based on submitted practice work.
 * This panel is kept in staging until Past Questions schema and workflows are promoted.
 */
(() => {
  "use strict";

  const STAGING_PROJECT_REF = "hywcpnoqqhxvujnimhxl";
  const $ = (id) => document.getElementById(id);
  let loading = false;
  let lastLoadedAt = 0;
  let requestVersion = 0;
  let loadingRequest = 0;
  let reloadWhenIdle = false;

  function isStagingEnvironment() {
    try {
      const url = String(window.CAMPUSSHIELD_SUPABASE_CONFIG?.url || "");
      return new URL(url).hostname === STAGING_PROJECT_REF + ".supabase.co";
    } catch (_error) {
      return false;
    }
  }

  function setStatus(message, state = "") {
    const node = $("shieldmind-insights-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function setMetric(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value);
  }

  function addText(parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(value ?? "");
    parent.appendChild(node);
    return node;
  }

  function clearNode(id) {
    const node = $(id);
    if (node) node.replaceChildren();
    return node;
  }

  function showStartPractice(show) {
    const actions = $("shieldmind-insights-actions");
    const button = $("shieldmind-insights-start");
    if (actions) actions.hidden = !show;
    if (button) button.hidden = !show;
  }

  function renderEmpty() {
    setMetric("shieldmind-insights-attempts", "0");
    setMetric("shieldmind-insights-average", "—");
    setMetric("shieldmind-insights-days", "0 / 7");
    setMetric("shieldmind-insights-topics-count", "0");
    const topics = clearNode("shieldmind-insights-topics");
    if (topics) addText(topics, "p", "shieldmind-insights-empty", "No completed practice history yet. Your topic insights will appear here after your first submitted practice session.");
    const recommendation = clearNode("shieldmind-insights-recommendation");
    if (recommendation) {
      addText(recommendation, "strong", "", "Start with one practice session");
      addText(recommendation, "p", "", "Complete a reviewed past-question practice set. ShieldMind will then summarize your recent scores and highlight topics worth revisiting.");
    }
    showStartPractice(true);
    setStatus("No submitted practice sessions have been recorded for this account yet.", "empty");
  }

  function renderTopics(topicRows) {
    const container = clearNode("shieldmind-insights-topics");
    if (!container) return;
    if (!topicRows.length) {
      addText(container, "p", "shieldmind-insights-empty", "Your submitted sessions are recorded. Topic-level accuracy will appear after answers have been marked.");
      return;
    }

    topicRows.slice(0, 5).forEach((topic) => {
      const level = topic.attempts < 2 ? "early" : topic.accuracy < 55 ? "priority" : topic.accuracy < 72 ? "strengthen" : "steady";
      const row = document.createElement("div");
      row.className = "shieldmind-insights-topic";
      row.dataset.level = level;
      const top = document.createElement("div");
      top.className = "shieldmind-insights-topic-top";
      addText(top, "strong", "shieldmind-insights-topic-name", topic.name);
      addText(top, "span", "shieldmind-insights-topic-score", Math.round(topic.accuracy) + "%");
      row.appendChild(top);
      const track = document.createElement("div");
      track.className = "shieldmind-insights-progress";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", Math.round(topic.accuracy) + " percent accuracy for " + topic.name);
      const fill = document.createElement("span");
      fill.style.width = Math.max(0, Math.min(100, topic.accuracy)) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      addText(row, "small", "shieldmind-insights-topic-detail",
        topic.attempts < 2 ? "Early signal · one practice session" :
          level === "priority" ? "Priority revision · " + topic.attempts + " sessions" :
          level === "strengthen" ? "Worth strengthening · " + topic.attempts + " sessions" :
          "On track · " + topic.attempts + " sessions");
      container.appendChild(row);
    });
  }

  function renderRecommendation(topicRows) {
    const container = clearNode("shieldmind-insights-recommendation");
    if (!container) return;
    const focus = topicRows.find((topic) => topic.attempts >= 2 && topic.accuracy < 72);
    const early = topicRows.find((topic) => topic.accuracy < 72);
    if (focus) {
      addText(container, "strong", "", "Focus next: " + focus.name);
      addText(container, "p", "", "Your recent marked answers show " + Math.round(focus.accuracy) + "% accuracy across " + focus.attempts + " practice sessions. Review the core concept, then retry a different question set.");
    } else if (early) {
      addText(container, "strong", "", "Early signal: " + early.name);
      addText(container, "p", "", "This topic has only one scored session so far. Practise it again before treating the score as a consistent weakness.");
    } else if (topicRows.length) {
      addText(container, "strong", "", "Keep your momentum");
      addText(container, "p", "", "Your tracked topics are currently on track. Use mixed practice questions to maintain recall and check that the knowledge transfers to new question styles.");
    } else {
      addText(container, "strong", "", "Marking is still in progress");
      addText(container, "p", "", "Your submitted sessions are saved. Topic recommendations will appear when marked answers are available.");
    }
  }

  function summarize(attempts, answers) {
    const scoredAttempts = attempts
      .filter((attempt) => attempt.percent !== null && attempt.percent !== undefined && attempt.percent !== "")
      .map((attempt) => Number(attempt.percent))
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
    const average = scoredAttempts.length
      ? Math.round(scoredAttempts.reduce((sum, score) => sum + score, 0) / scoredAttempts.length)
      : null;

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);
    const studyDays = new Set(attempts
      .map((attempt) => attempt.submitted_at ? new Date(attempt.submitted_at) : null)
      .filter((date) => date && Number.isFinite(date.getTime()) && date >= since)
      .map((date) => date.toLocaleDateString())).size;

    const topics = new Map();
    for (const answer of answers) {
      if (answer.marking_status === "needs_review") continue;
      if (answer.maximum_marks === null || answer.maximum_marks === undefined ||
          answer.awarded_marks === null || answer.awarded_marks === undefined) continue;
      const maximum = Number(answer.maximum_marks);
      const awarded = Number(answer.awarded_marks);
      if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(awarded) || awarded < 0) continue;
      const name = String(answer.topic_snapshot || "").trim().slice(0, 160) || "General / uncategorized";
      if (!topics.has(name)) topics.set(name, { name, earned: 0, maximum: 0, questions: 0, attemptIds: new Set() });
      const item = topics.get(name);
      item.earned += Math.min(awarded, maximum);
      item.maximum += maximum;
      item.questions += 1;
      item.attemptIds.add(answer.attempt_id);
    }

    const topicRows = [...topics.values()]
      .filter((topic) => topic.maximum > 0)
      .map((topic) => ({
        name: topic.name,
        accuracy: Math.max(0, Math.min(100, (topic.earned / topic.maximum) * 100)),
        attempts: topic.attemptIds.size,
        questions: topic.questions,
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);

    setMetric("shieldmind-insights-attempts", attempts.length);
    setMetric("shieldmind-insights-average", average === null ? "—" : average + "%");
    setMetric("shieldmind-insights-days", studyDays + " / 7");
    setMetric("shieldmind-insights-topics-count", topicRows.length);
    renderTopics(topicRows);
    renderRecommendation(topicRows);
    showStartPractice(false);
    setStatus(
      "Based on your " + attempts.length + " most recent submitted practice session(s). Topic accuracy uses marked answers only.",
      "ok"
    );
  }

  async function fetchAnswers(client, attempts) {
    const allAnswers = [];
    const ids = attempts.map((attempt) => attempt.id).filter(Boolean);
    // Each attempt contains at most 200 questions. Four at a time stay below
    // the Data API's normal row cap without dropping older questions silently.
    for (let start = 0; start < ids.length; start += 4) {
      const batch = ids.slice(start, start + 4);
      const { data, error } = await client.from("practice_answers")
        .select("attempt_id,topic_snapshot,maximum_marks,awarded_marks,marking_status")
        .in("attempt_id", batch)
        .limit(1000);
      if (error) throw error;
      if (Array.isArray(data)) allAnswers.push(...data);
    }
    return allAnswers;
  }

  async function load(options = {}) {
    const panel = $("shieldmind-learning-insights");
    if (!panel) return;
    const access = window.CampusShieldShieldMindAccess;
    if (!access?.active || !isStagingEnvironment()) {
      requestVersion += 1;
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (loading) {
      if (loadingRequest !== requestVersion) reloadWhenIdle = true;
      return;
    }
    if (!options.force && lastLoadedAt && Date.now() - lastLoadedAt < 60000) return;

    const request = ++requestVersion;
    loading = true;
    loadingRequest = request;
    setStatus("Loading your private practice history…");
    try {
      const client = window.CampusShieldBackend?.client;
      if (!client) throw new Error("Backend unavailable");
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData?.user) throw new Error("Sign-in required");
      const user = authData.user;
      const { data: attempts, error: attemptsError } = await client.from("practice_attempts")
        .select("id,status,percent,submitted_at,started_at,question_count,mode")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(12);
      if (attemptsError) throw attemptsError;
      if (request !== requestVersion || !window.CampusShieldShieldMindAccess?.active) return;
      if (!Array.isArray(attempts) || !attempts.length) {
        renderEmpty();
        lastLoadedAt = Date.now();
        return;
      }
      const answers = await fetchAnswers(client, attempts);
      if (request !== requestVersion || !window.CampusShieldShieldMindAccess?.active) return;
      summarize(attempts, answers);
      lastLoadedAt = Date.now();
    } catch (_error) {
      if (request === requestVersion) {
        setStatus("We could not load your learning insights. Refresh to try again; your practice records have not been changed.", "error");
      }
    } finally {
      loading = false;
      loadingRequest = 0;
      if (reloadWhenIdle && window.CampusShieldShieldMindAccess?.active && !panel.hidden) {
        reloadWhenIdle = false;
        void load({ force: true });
      } else {
        reloadWhenIdle = false;
      }
    }
  }

  function syncAccess(event) {
    const access = event?.detail || window.CampusShieldShieldMindAccess;
    const panel = $("shieldmind-learning-insights");
    if (!panel) return;
    if (!access?.active || !isStagingEnvironment()) {
      requestVersion += 1;
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    void load();
  }

  function init() {
    $("shieldmind-insights-refresh")?.addEventListener("click", () => void load({ force: true }));
    document.addEventListener("campusshield:shieldmind-access", syncAccess);
    document.addEventListener("campusshield:session-changed", () => {
      lastLoadedAt = 0;
      void load({ force: true });
    });
    syncAccess({ detail: window.CampusShieldShieldMindAccess });
  }

  window.CampusShieldLearningInsights = { load: () => load({ force: true }) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
