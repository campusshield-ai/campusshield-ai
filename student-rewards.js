(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let loading = false;
  let lastLoadedAt = 0;

  function status(message, isError = false) {
    const node = $("student-rewards-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = isError ? "error" : "ok";
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function renderChallenges(challenges) {
    const feed = $("student-rewards-challenges");
    if (!feed) return;
    feed.replaceChildren();
    if (!challenges.length) {
      feed.append(element("p", "message", "No active challenges are available right now."));
      return;
    }

    challenges.forEach((challenge) => {
      const target = Math.max(1, Number(challenge.target_count) || 1);
      const count = challenge.completed ? target : Math.max(0, Math.min(target, Number(challenge.progress_count) || 0));
      const percent = Math.round((count / target) * 100);
      const card = element("article", "student-reward-challenge" + (challenge.completed ? " is-complete" : ""));
      const top = element("div", "student-reward-challenge-top");
      const copy = element("div", "student-reward-challenge-copy");
      copy.append(element("h3", "", challenge.title), element("p", "", challenge.description));
      const points = element("span", "student-reward-points", "+" + (Number(challenge.points) || 0) + " pts");
      top.append(copy, points);
      const progress = element("div", "student-reward-progress");
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", challenge.title + " progress");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", String(target));
      progress.setAttribute("aria-valuenow", String(count));
      const fill = element("span");
      fill.style.width = percent + "%";
      progress.append(fill);
      const foot = element("div", "student-reward-challenge-foot");
      foot.append(
        element("span", "", challenge.completed ? "Completed this week" : count + " of " + target + " completed"),
        element("strong", "", challenge.completed ? "Earned ✓" : percent + "%")
      );
      card.append(top, progress, foot);
      feed.append(card);
    });
  }

  function renderBadges(badges) {
    const feed = $("student-rewards-badges");
    if (!feed) return;
    feed.replaceChildren();
    if (!badges.length) {
      feed.append(element("p", "message", "Badges will appear as you earn points."));
      return;
    }
    badges.forEach((badge) => {
      const card = element("article", "student-reward-badge" + (badge.earned ? " is-earned" : ""));
      card.append(
        element("span", "student-reward-badge-icon", badge.icon || "✧"),
        element("strong", "", badge.name),
        element("small", "", badge.earned ? "Earned" : (Number(badge.points_threshold) || 0) + " points to unlock"),
        element("p", "", badge.description)
      );
      feed.append(card);
    });
  }

  function render(payload) {
    const data = payload && typeof payload === "object" ? payload : {};
    const total = Math.max(0, Number(data.total_points) || 0);
    const totalNode = $("student-rewards-total");
    if (totalNode) totalNode.textContent = total.toLocaleString();
    const challenges = Array.isArray(data.challenges) ? data.challenges : [];
    const badges = Array.isArray(data.badges) ? data.badges : [];
    const completed = challenges.filter((challenge) => challenge.completed).length;
    const completedNode = $("student-rewards-completed");
    if (completedNode) completedNode.textContent = completed + " / " + challenges.length;
    const weekNode = $("student-rewards-week");
    if (weekNode) {
      const date = data.week_start ? new Date(data.week_start + "T12:00:00") : null;
      weekNode.textContent = date && !Number.isNaN(date.getTime())
        ? "Week of " + date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "This week";
    }
    renderChallenges(challenges);
    renderBadges(badges);
    status("Progress refreshed from your saved CampusShield activity.");
  }

  async function load(options = {}) {
    if (loading) return;
    if (!options.force && Date.now() - lastLoadedAt < 15000) return;
    const api = window.CampusShieldBackend;
    if (!api?.isConfigured || typeof api.getMyStudentRewards !== "function") {
      status("Rewards are not available because the secure Supabase connection is not configured.", true);
      return;
    }
    loading = true;
    const refresh = $("student-rewards-refresh");
    if (refresh) refresh.disabled = true;
    status("Checking your saved study and campus activity…");
    try {
      const user = await api.getCurrentUser();
      if (!user) {
        render({ total_points: 0, challenges: [], badges: [] });
        status("Sign in to view your student progress.", true);
        return;
      }
      const data = await api.getMyStudentRewards();
      render(data);
      lastLoadedAt = Date.now();
    } catch (error) {
      console.error("Student rewards could not load:", error);
      status(error?.message || "Could not load your rewards. Please try again.", true);
    } finally {
      loading = false;
      if (refresh) refresh.disabled = false;
    }
  }

  function init() {
    $("student-rewards-refresh")?.addEventListener("click", () => load({ force: true }));
    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-page='student-rewards']");
      if (nav) window.setTimeout(() => load(), 0);
    });
    window.addEventListener("campusshield:session-changed", () => {
      lastLoadedAt = 0;
      const page = $("page-student-rewards");
      if (page?.classList.contains("active")) load({ force: true });
    });
    window.addEventListener("campusshield:student-activity-updated", () => {
      lastLoadedAt = 0;
      if ($("page-student-rewards")?.classList.contains("active")) load({ force: true });
    });
  }

  window.CampusShieldStudentRewards = { load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();