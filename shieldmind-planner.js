(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const allowedKinds = new Set(["revision", "class", "assignment", "exam", "reminder"]);
  const notified = new Set();
  let reminderTimer = null;
  let loading = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function status(message, isError = false) {
    const node = byId("shieldmind-planner-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = isError ? "error" : "ok";
  }

  function toIso(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
    return date.toISOString();
  }

  function localDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatDate(value) {
    if (!value) return "No date set";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
  }

  function backend() {
    const client = window.CampusShieldBackend?.client;
    if (!client) throw new Error("The secure backend is not configured.");
    return client;
  }

  async function signedIn() {
    const client = backend();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user) throw new Error("Sign in to manage your private timetable.");
    return data.session.user;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await backend().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function render(items) {
    const feed = byId("shieldmind-planner-feed");
    if (!feed) return;
    if (!Array.isArray(items) || items.length === 0) {
      feed.innerHTML = '<div class="community-empty">No timetable items yet. Add a class, study session, assignment, exam, or reminder above.</div>';
      return;
    }
    feed.innerHTML = items.map((item) => {
      const id = escapeHtml(item.id);
      const title = escapeHtml(item.title);
      const kind = escapeHtml((item.kind || "revision").replaceAll("_", " "));
      const details = escapeHtml(item.details || "");
      const starts = escapeHtml(formatDate(item.starts_at));
      const remind = item.remind_at ? escapeHtml(formatDate(item.remind_at)) : "No reminder";
      return '<article class="shieldmind-planner-item" data-planner-item="' + id + '">' +
        '<div><h3>' + title + '</h3>' +
        '<p class="shieldmind-planner-meta">' + kind + ' · ' + (item.completed ? "Completed" : "In progress") + '</p>' +
        '<p><strong>Starts:</strong> ' + starts + '</p>' +
        '<p><strong>Reminder:</strong> ' + remind + '</p>' +
        (details ? '<p>' + details + '</p>' : '') +
        '</div><div class="shieldmind-planner-actions">' +
        '<button class="btn secondary" type="button" data-planner-action="toggle" data-planner-id="' + id + '" data-completed="' + String(Boolean(item.completed)) + '">' +
        (item.completed ? "Mark incomplete" : "Mark complete") + '</button>' +
        '<button class="btn secondary" type="button" data-planner-action="delete" data-planner-id="' + id + '">Delete</button>' +
        '</div></article>';
    }).join("");
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      await signedIn();
      const items = await rpc("list_my_shieldmind_planner_items");
      render(items);
      status("Your private timetable is up to date.");
      startReminderChecks();
    } catch (error) {
      render([]);
      status(error?.message || "Could not load your timetable.", true);
    } finally {
      loading = false;
    }
  }

  async function save(event) {
    event.preventDefault();
    const saveButton = byId("shieldmind-plan-save");
    if (saveButton) saveButton.disabled = true;
    try {
      await signedIn();
      const title = String(byId("shieldmind-plan-title")?.value || "").trim();
      const kind = String(byId("shieldmind-plan-kind")?.value || "revision");
      const details = String(byId("shieldmind-plan-details")?.value || "").trim();
      if (title.length < 2 || title.length > 120) throw new Error("Title must be between 2 and 120 characters.");
      if (!allowedKinds.has(kind)) throw new Error("Choose a valid timetable item type.");
      if (details.length > 1000) throw new Error("Notes must be 1,000 characters or fewer.");
      const startsAt = toIso(byId("shieldmind-plan-start")?.value);
      const remindAt = toIso(byId("shieldmind-plan-remind")?.value);
      if (startsAt && remindAt && new Date(remindAt) > new Date(startsAt)) {
        // A reminder may be after the event if the user explicitly wants a follow-up;
        // do not block that valid use case.
      }
      await rpc("create_my_shieldmind_planner_item", {
        p_title: title, p_kind: kind, p_details: details,
        p_starts_at: startsAt, p_remind_at: remindAt
      });
      byId("shieldmind-planner-form")?.reset();
      status("Saved to your private timetable.");
      await load();
    } catch (error) {
      status(error?.message || "Could not save this item.", true);
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function action(event) {
    const button = event.target.closest("[data-planner-action]");
    if (!button) return;
    const id = button.dataset.plannerId;
    if (!id) return;
    const actionName = button.dataset.plannerAction;
    button.disabled = true;
    try {
      await signedIn();
      if (actionName === "toggle") {
        await rpc("update_my_shieldmind_planner_item", {
          p_item_id: id, p_completed: button.dataset.completed !== "true"
        });
        status("Timetable item updated.");
      } else if (actionName === "delete") {
        if (!window.confirm("Delete this timetable item? This cannot be undone.")) return;
        await rpc("delete_my_shieldmind_planner_item", { p_item_id: id });
        notified.delete(id);
        status("Timetable item deleted.");
      }
      await load();
    } catch (error) {
      status(error?.message || "Could not update this item.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      status("This browser does not support notifications. Keep the app open and use the timetable list instead.", true);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        status("Browser notifications were not enabled. You can change this in your browser settings.", true);
        return;
      }
      status("Browser reminders enabled while this app is open.");
      startReminderChecks();
    } catch (error) {
      status(error?.message || "Could not enable browser notifications.", true);
    }
  }

  async function checkReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted" || document.hidden) return;
    try {
      await signedIn();
      const items = await rpc("list_my_shieldmind_planner_items");
      const now = Date.now();
      for (const item of Array.isArray(items) ? items : []) {
        if (!item?.id || item.completed || !item.remind_at || notified.has(item.id)) continue;
        const due = new Date(item.remind_at).getTime();
        if (Number.isFinite(due) && due <= now && due >= now - 24 * 60 * 60 * 1000) {
          new Notification("CampusShield study reminder", {
            body: String(item.title || "Your scheduled item").slice(0, 180),
            tag: "campusshield-planner-" + item.id
          });
          notified.add(item.id);
        }
      }
    } catch (_error) {
      // Reminder polling is best-effort; the timetable remains available manually.
    }
  }

  function startReminderChecks() {
    if (reminderTimer !== null) return;
    reminderTimer = window.setInterval(checkReminders, 60000);
  }

  function init() {
    byId("shieldmind-planner-form")?.addEventListener("submit", save);
    byId("shieldmind-planner-refresh")?.addEventListener("click", load);
    byId("shieldmind-plan-notifications")?.addEventListener("click", enableNotifications);
    byId("shieldmind-planner-feed")?.addEventListener("click", action);
    window.addEventListener("campusshield:session-changed", load);
  }

  window.CampusShieldPlanner = { load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
