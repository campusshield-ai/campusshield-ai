(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let activeGroupId = null;
  let activeGroupName = "";
  let subscription = null;
  let subscriptionGroupId = null;
  let isCampusModerator = false;
  let isLoading = false;

  function api() {
    if (!window.CampusShieldBackend?.isConfigured) throw new Error("CampusShield's secure backend is not configured.");
    return window.CampusShieldBackend;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function setStatus(message, isError = false) {
    const node = $("campus-course-discussion-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = isError ? "error" : "ok";
  }

  function stopSubscription() {
    const current = subscription;
    subscription = null;
    subscriptionGroupId = null;
    if (current && window.CampusShieldBackend?.unsubscribeCampusCourseCommunityMessages) {
      window.CampusShieldBackend.unsubscribeCampusCourseCommunityMessages(current).catch((error) => {
        console.warn("Could not close course discussion subscription:", error?.message || error);
      });
    }
  }

  function showCompose(enabled) {
    const input = $("campus-course-discussion-input");
    const send = $("campus-course-discussion-send");
    if (input) input.disabled = !enabled;
    if (send) send.disabled = !enabled;
  }

  function friendlyTime(value) {
    if (!value) return "Just now";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Recently"
      : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderMessages(messages) {
    const feed = $("campus-course-discussion-messages");
    if (!feed) return;
    feed.replaceChildren();
    if (!Array.isArray(messages) || !messages.length) {
      const empty = document.createElement("div");
      empty.className = "campus-chat-empty";
      const title = document.createElement("strong");
      title.textContent = "Start the conversation";
      const desc = document.createElement("p");
      desc.textContent = "Ask a question, explain a concept, share a study tip or find classmates to revise with.";
      empty.append(title, desc);
      feed.appendChild(empty);
      return;
    }

    messages.forEach((message) => {
      const article = document.createElement("article");
      article.className = "campus-course-discussion-message" + (message.is_mine ? " is-mine" : "");

      const header = document.createElement("div");
      header.className = "campus-course-discussion-message-head";
      const author = document.createElement("strong");
      author.textContent = "@" + String(message.author_username || "campus_member");
      const time = document.createElement("time");
      time.dateTime = message.created_at || "";
      time.textContent = friendlyTime(message.created_at);
      header.append(author, time);

      const body = document.createElement("p");
      body.className = "campus-course-discussion-message-body";
      body.textContent = String(message.body || "");
      article.append(header, body);

      if (!message.is_mine && message.status === "published") {
        const actions = document.createElement("div");
        actions.className = "campus-course-discussion-message-actions";
        const report = document.createElement("button");
        report.type = "button";
        report.textContent = "Report message";
        report.setAttribute("aria-label", "Report message from @" + String(message.author_username || "campus_member"));
        report.addEventListener("click", () => {
          const dialog = $("campus-course-discussion-report-dialog");
          if (!dialog || typeof dialog.showModal !== "function") {
            setStatus("Message reporting is not supported in this browser.", true);
            return;
          }
          $("campus-course-discussion-report-message-id").value = message.id;
          $("campus-course-discussion-report-details").value = "";
          $("campus-course-discussion-report-status").textContent = "";
          dialog.showModal();
        });
        actions.appendChild(report);
        article.appendChild(actions);
      }
      feed.appendChild(article);
    });
    feed.scrollTop = feed.scrollHeight;
  }

  async function loadMessages(options = {}) {
    if (!activeGroupId) return;
    const currentGroupId = activeGroupId;
    const messages = await api().listCampusCourseCommunityMessages(currentGroupId);
    if (activeGroupId !== currentGroupId) return;
    renderMessages(messages);
    if (!options.quiet) {
      setStatus("Only members of this approved course community can read or post here.");
    }
  }

  function canModerateFromContext(context) {
    const role = context?.campus_role || context?.role || context?.membership_role || "";
    return context?.membership_status === "active" &&
      context?.verification_status === "verified" &&
      ["teacher", "security", "admin"].includes(role);
  }

  async function loadReports() {
    const panel = $("campus-course-discussion-staff");
    const feed = $("campus-course-discussion-reports-feed");
    const status = $("campus-course-discussion-reports-status");
    if (!panel || !feed || !status) return;
    panel.hidden = !isCampusModerator;
    if (!isCampusModerator) return;
    status.textContent = "Loading reports for your university…";
    feed.replaceChildren();

    try {
      const reports = await api().listCampusCourseCommunityReports();
      if (!reports.length) {
        status.textContent = "No pending course discussion reports.";
        return;
      }
      status.textContent = reports.length + " pending report" + (reports.length === 1 ? "" : "s") + ".";
      reports.forEach((report) => {
        const card = document.createElement("article");
        card.className = "campus-course-discussion-report-card";
        const title = document.createElement("strong");
        const labels = {
          spam: "Spam",
          harassment: "Harassment or bullying",
          personal_information: "Personal information",
          threats: "Threats",
          other: "Other concern"
        };
        title.textContent = "@" + String(report.author_username || "campus_member") + " · " + (labels[report.reason] || "Report");
        const quoted = document.createElement("blockquote");
        quoted.textContent = report.message_body || "[Message unavailable]";
        const context = document.createElement("p");
        context.textContent = "Reported by @" + String(report.reporter_username || "campus_member") +
          (report.details ? " · " + report.details : "") + " · " + friendlyTime(report.created_at);
        const actions = document.createElement("div");
        actions.className = "actions";

        const hide = document.createElement("button");
        hide.type = "button";
        hide.className = "btn danger";
        hide.textContent = "Hide message";
        hide.addEventListener("click", async () => {
          hide.disabled = true;
          try {
            await api().resolveCampusCourseCommunityReport(report.report_id, "hide");
            await loadReports();
            if (activeGroupId === report.group_id) await loadMessages({ quiet: true });
            window.alert("The message has been hidden and the report reviewed.");
          } catch (error) {
            setStatus(error?.message || "Could not hide the reported message.", true);
            hide.disabled = false;
          }
        });

        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "btn secondary";
        dismiss.textContent = "Dismiss report";
        dismiss.addEventListener("click", async () => {
          dismiss.disabled = true;
          try {
            await api().resolveCampusCourseCommunityReport(report.report_id, "dismiss");
            await loadReports();
          } catch (error) {
            setStatus(error?.message || "Could not dismiss the report.", true);
            dismiss.disabled = false;
          }
        });

        actions.append(hide, dismiss);
        card.append(title, quoted, context, actions);
        feed.appendChild(card);
      });
    } catch (error) {
      panel.hidden = true;
      status.textContent = error?.message || "Campus staff report access is unavailable.";
    }
  }

  async function open(groupId, groupName) {
    if (isLoading) return;
    isLoading = true;
    stopSubscription();
    activeGroupId = groupId;
    activeGroupName = String(groupName || "Course community");
    $("campus-course-discussion-title").textContent = activeGroupName + " · Discussion";
    $("campus-course-discussion-subtitle").textContent = "Member-only study questions, explanations and learning tips.";
    $("campus-course-discussion-panel").hidden = false;
    $("campus-course-discussion-panel").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    $("campus-course-discussion-messages").replaceChildren();
    showCompose(false);
    setStatus("Checking course membership and loading the discussion…");

    try {
      const context = await api().getMyCampusContext();
      isCampusModerator = canModerateFromContext(context);
      await loadMessages();
      showCompose(true);
      subscription = api().subscribeCampusCourseCommunityMessages(groupId, (row) => {
        if (activeGroupId !== groupId || row?.group_id !== groupId) return;
        loadMessages({ quiet: true }).catch(() => {});
        if (isCampusModerator) loadReports();
      }, (state) => {
        if (activeGroupId !== groupId) return;
        if (state === "SUBSCRIBED") setStatus("Live course discussion connected.");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          setStatus("Live updates are reconnecting. Refresh this discussion if a new message does not appear.");
        }
      });
      subscriptionGroupId = groupId;
      await loadReports();
    } catch (error) {
      showCompose(false);
      setStatus(error?.message || "Join this approved course community before opening its discussion.", true);
      $("campus-course-discussion-messages").innerHTML =
        '<div class="campus-timetable-empty"><strong>Discussion unavailable</strong><p>Make sure you have joined this approved course community and that your university access is verified.</p></div>';
    } finally {
      isLoading = false;
    }
  }

  function close() {
    stopSubscription();
    activeGroupId = null;
    activeGroupName = "";
    isCampusModerator = false;
    $("campus-course-discussion-panel").hidden = true;
    $("campus-course-discussion-messages").replaceChildren();
    $("campus-course-discussion-input").value = "";
    showCompose(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeGroupId) return;
    const input = $("campus-course-discussion-input");
    const send = $("campus-course-discussion-send");
    const body = String(input?.value || "").trim();
    if (!body) {
      input?.focus();
      return;
    }
    if (body.length > 1200) {
      setStatus("Messages must be 1,200 characters or fewer.", true);
      return;
    }
    if (send) send.disabled = true;
    setStatus("Sending your message…");
    try {
      await api().sendCampusCourseCommunityMessage(activeGroupId, body);
      input.value = "";
      await loadMessages({ quiet: true });
      setStatus("Message sent to " + activeGroupName + ".");
      input.focus();
    } catch (error) {
      setStatus(error?.message || "Could not send this message.", true);
    } finally {
      if (send) send.disabled = false;
    }
  }

  async function reportMessage(event) {
    event.preventDefault();
    const messageId = $("campus-course-discussion-report-message-id").value;
    const submit = $("campus-course-discussion-report-submit");
    const status = $("campus-course-discussion-report-status");
    if (!messageId) return;
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Submitting report…";
    try {
      await api().reportCampusCourseCommunityMessage(
        messageId,
        $("campus-course-discussion-report-reason").value,
        $("campus-course-discussion-report-details").value
      );
      $("campus-course-discussion-report-dialog").close();
      setStatus("Report sent to authorized campus staff.");
      if (isCampusModerator) await loadReports();
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not submit the report.";
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function init() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-course-discussion]");
      if (button) {
        event.preventDefault();
        open(button.dataset.courseGroupId, button.dataset.courseGroupName);
        return;
      }
      const nav = event.target.closest("[data-page]");
      if (nav && nav.dataset.page !== "groups" && activeGroupId) close();
    });
    $("campus-course-discussion-close")?.addEventListener("click", close);
    $("campus-course-discussion-form")?.addEventListener("submit", sendMessage);
    $("campus-course-discussion-report-cancel")?.addEventListener("click", () => {
      $("campus-course-discussion-report-dialog")?.close();
    });
    $("campus-course-discussion-report-form")?.addEventListener("submit", reportMessage);
    $("campus-course-discussion-refresh-reports")?.addEventListener("click", loadReports);
    window.addEventListener("campusshield:session-changed", close);
  }

  window.CampusShieldCourseCommunity = { open, close };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();