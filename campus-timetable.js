(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const kindLabels = {
    class: "Class",
    assignment: "Assignment",
    exam: "Exam",
    revision: "Study session",
    reminder: "Reminder"
  };
  let timetableItems = [];
  let publishedCourses = [];
  let campusEvents = [];
  let campusContext = null;
  let selectedDate = new Date();
  let weekStart = startOfWeek(new Date());
  let loading = false;
  let reminderTimer = null;
  const notifiedReminderKeys = new Set();
  const CALENDAR_EXPORT_DAYS = 90;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function pad(value) { return String(value).padStart(2, "0"); }

  function dateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function dateFromKey(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfWeek(date) {
    const result = startOfDay(date);
    const mondayIndex = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - mondayIndex);
    return result;
  }

  function addDays(date, amount) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + amount);
    return result;
  }

  function isoWeekday(date) {
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function formatTime(value) {
    if (!value) return "Any time";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "Any time";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function formatDay(date, options = { weekday: "short", month: "short", day: "numeric" }) {
    return date.toLocaleDateString([], options);
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  function localInputDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function toIso(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
    return date.toISOString();
  }

  function status(message, isError = false) {
    const node = byId("campus-timetable-status");
    if (node) {
      node.textContent = message;
      node.dataset.state = isError ? "error" : "ok";
    }
  }

  function formStatus(message, isError = false) {
    const node = byId("campus-timetable-form-status");
    if (node) {
      node.textContent = message;
      node.dataset.state = isError ? "error" : "ok";
    }
  }

  function backend() {
    const api = window.CampusShieldBackend;
    if (!api?.isConfigured) throw new Error("CampusShield's secure backend is not configured.");
    return api;
  }

  function currentWeekDays() {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  function weekdaysForItem(item) {
    return Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [];
  }

  function recurringStartForDate(item, date) {
    const weekdays = weekdaysForItem(item);
    if (!item.starts_at || !weekdays.length || item.kind !== "class") return null;
    if (!weekdays.includes(isoWeekday(date))) return null;
    const firstDate = startOfDay(new Date(item.starts_at));
    const currentDate = startOfDay(date);
    if (currentDate < firstDate) return null;
    const repeatUntil = item.repeat_until ? dateFromKey(item.repeat_until) : null;
    if (repeatUntil && currentDate > repeatUntil) return null;
    const seed = new Date(item.starts_at);
    return new Date(
      date.getFullYear(), date.getMonth(), date.getDate(),
      seed.getHours(), seed.getMinutes(), seed.getSeconds(), 0
    );
  }

  function occurrenceForItem(item, date) {
    if (!item.starts_at) return null;
    const weekdays = weekdaysForItem(item);
    if (weekdays.length && item.kind === "class") {
      const start = recurringStartForDate(item, date);
      if (!start) return null;
      let end = null;
      if (item.ends_at && new Date(item.ends_at).getTime() > new Date(item.starts_at).getTime()) {
        end = new Date(start.getTime() + (new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()));
      }
      return { type: "planner", item, start, end, recurring: true, sourceId: item.id };
    }
    const start = new Date(item.starts_at);
    if (dateKey(start) !== dateKey(date)) return null;
    return { type: "planner", item, start, end: item.ends_at ? new Date(item.ends_at) : null, recurring: false, sourceId: item.id };
  }

  function eventForDate(event, date) {
    if (!event.starts_at) return null;
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime()) || dateKey(start) !== dateKey(date)) return null;
    return { type: "event", event, start, end: event.ends_at ? new Date(event.ends_at) : null, recurring: false, sourceId: event.id };
  }

  function setWeek(newStart, newSelected) {
    weekStart = startOfWeek(newStart);
    selectedDate = startOfDay(newSelected || newStart);
    renderCalendar();
  }

  function renderDayPicker() {
    const picker = byId("campus-timetable-day-picker");
    if (!picker) return;
    picker.replaceChildren();
    const todayKey = dateKey(new Date());
    const selectedKey = dateKey(selectedDate);
    const days = currentWeekDays();

    days.forEach((date) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "campus-timetable-day-button" +
        (dateKey(date) === selectedKey ? " active" : "") +
        (dateKey(date) === todayKey ? " is-today" : "");
      button.setAttribute("aria-pressed", String(dateKey(date) === selectedKey));
      const label = document.createElement("span");
      label.textContent = weekdayLabels[isoWeekday(date) - 1];
      const dayNumber = document.createElement("strong");
      dayNumber.textContent = String(date.getDate());
      const count = document.createElement("small");
      const scheduledCount = timetableItems.reduce((total, item) => total + (occurrenceForItem(item, date) ? 1 : 0), 0) +
        campusEvents.reduce((total, item) => total + (eventForDate(item, date) ? 1 : 0), 0);
      count.textContent = scheduledCount ? scheduledCount + (scheduledCount === 1 ? " item" : " items") : "—";
      button.append(label, dayNumber, count);
      button.addEventListener("click", () => {
        selectedDate = startOfDay(date);
        renderCalendar();
      });
      picker.appendChild(button);
    });

    const end = addDays(weekStart, 6);
    byId("campus-timetable-week-range").textContent =
      formatDay(weekStart, { month: "short", day: "numeric" }) + " – " +
      formatDay(end, { month: "short", day: "numeric", year: "numeric" });
    byId("campus-timetable-selected-label").textContent =
      dateKey(selectedDate) === todayKey ? "Today" : formatDay(selectedDate, { weekday: "long" }).toUpperCase();
    byId("campus-timetable-selected-date").textContent =
      formatDay(selectedDate, { month: "long", day: "numeric" });
  }

  function timeLabel(occurrence) {
    if (!occurrence.start) return "Any time";
    return formatTime(occurrence.start) + (occurrence.end ? " – " + formatTime(occurrence.end) : "");
  }

  function renderPlannerOccurrence(occurrence) {
    const item = occurrence.item;
    const kind = kindLabels[item.kind] || "Timetable item";
    const completedClass = item.completed ? " is-completed" : "";
    const courseLabel = item.course_code ? item.course_code + (item.course_title ? " · " + item.course_title : "") : "";
    const weekdayLabel = weekdaysForItem(item).map((day) => weekdayLabels[day - 1]).join(", ");
    const repeatMeta = occurrence.recurring ? "Repeats weekly" + (weekdayLabel ? " · " + weekdayLabel : "") : "";
    const details = item.details ? '<p class="campus-timetable-item-details">' + escapeHtml(item.details) + "</p>" : "";
    const courseMeta = courseLabel ? '<span>📘 ' + escapeHtml(courseLabel) + "</span>" : "";
    const locationMeta = item.location ? '<span>📍 ' + escapeHtml(item.location) + "</span>" : "";
    const repeatUntilMeta = occurrence.recurring && item.repeat_until
      ? '<span>Until ' + escapeHtml(formatDay(dateFromKey(item.repeat_until), { month: "short", day: "numeric", year: "numeric" })) + "</span>"
      : "";
    const courseButton = item.course_code
      ? '<button type="button" class="btn secondary" data-page="groups" data-course-search="' + escapeHtml(item.course_code) + '">Find course community</button>'
      : '<button type="button" class="btn secondary" data-page="courses">Link a course</button>';
    const toggleButton = occurrence.recurring
      ? ""
      : '<button type="button" class="btn secondary" data-timetable-action="toggle" data-timetable-id="' + escapeHtml(item.id) + '" data-completed="' + String(Boolean(item.completed)) + '">' + (item.completed ? "Mark incomplete" : "Mark complete") + "</button>";
    const deleteButton = '<button type="button" class="btn secondary" data-timetable-action="delete" data-timetable-id="' + escapeHtml(item.id) + '">Delete</button>';
    return '<article class="campus-timetable-item' + completedClass + '">' +
      '<div class="campus-timetable-item-time"><strong>' + escapeHtml(formatTime(occurrence.start)) + "</strong>" +
      '<small>' + escapeHtml(occurrence.end ? formatTime(occurrence.end) : (occurrence.recurring ? "Weekly" : "")) + "</small></div>" +
      '<div class="campus-timetable-item-body"><div class="campus-timetable-item-top"><h4>' + escapeHtml(item.title) + "</h4>" +
      '<span class="campus-timetable-kind">' + escapeHtml(kind) + "</span></div>" +
      details +
      '<div class="campus-timetable-item-meta">' + courseMeta + locationMeta + (repeatMeta ? "<span>" + escapeHtml(repeatMeta) + "</span>" : "") + repeatUntilMeta + "</div>" +
      '<div class="campus-timetable-item-actions">' + courseButton + toggleButton + deleteButton + "</div></div></article>";
  }

  function renderEventOccurrence(occurrence) {
    const event = occurrence.event;
    return '<article class="campus-timetable-event-card">' +
      '<div class="campus-timetable-event-date"><strong>' + escapeHtml(formatTime(occurrence.start)) + '</strong><small>' + escapeHtml(event.category || "event") + "</small></div>" +
      '<div class="campus-timetable-event-copy"><h4>' + escapeHtml(event.title || "Campus event") + "</h4>" +
      '<p>' + escapeHtml([event.location, event.organizer_username ? "@" + event.organizer_username : ""].filter(Boolean).join(" · ") || "Published university event") + "</p></div>" +
      '<button type="button" class="btn secondary" data-page="events">View event</button></article>";
  }

  function renderCalendar() {
    renderDayPicker();
    const date = startOfDay(selectedDate);
    const occurrences = [];
    timetableItems.forEach((item) => {
      const occurrence = occurrenceForItem(item, date);
      if (occurrence) occurrences.push(occurrence);
    });
    campusEvents.forEach((event) => {
      const occurrence = eventForDate(event, date);
      if (occurrence) occurrences.push(occurrence);
    });
    occurrences.sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.getTime() - b.start.getTime();
    });

    const feed = byId("campus-timetable-day-feed");
    if (!occurrences.length) {
      feed.innerHTML = '<div class="campus-timetable-empty"><strong>No items for this day yet</strong><p>Add a class or task, or check upcoming university events. You can switch days above to see the rest of your week.</p></div>';
    } else {
      feed.innerHTML = occurrences.map((occurrence) =>
        occurrence.type === "event" ? renderEventOccurrence(occurrence) : renderPlannerOccurrence(occurrence)
      ).join("");
    }

    byId("campus-timetable-selected-count").textContent =
      occurrences.length + (occurrences.length === 1 ? " item" : " items");
  }

  function renderUnscheduledTasks() {
    const feed = byId("campus-timetable-unscheduled-feed");
    if (!feed) return;
    const unscheduled = timetableItems.filter((item) => !item.starts_at && !item.completed);
    if (!unscheduled.length) {
      feed.innerHTML = '<div class="community-empty">No tasks without a time. Add an assignment or reminder above and leave its date blank to keep it here.</div>';
      return;
    }
    feed.innerHTML = unscheduled.map((item) => {
      const kind = kindLabels[item.kind] || "Timetable item";
      const details = item.details ? '<p class="campus-timetable-item-details">' + escapeHtml(item.details) + "</p>" : "";
      return '<article class="campus-timetable-item"><div class="campus-timetable-item-time"><strong>—</strong><small>Any time</small></div>' +
        '<div class="campus-timetable-item-body"><div class="campus-timetable-item-top"><h4>' + escapeHtml(item.title) + '</h4><span class="campus-timetable-kind">' + escapeHtml(kind) + "</span></div>" +
        details + '<div class="campus-timetable-item-actions"><button type="button" class="btn secondary" data-timetable-action="toggle" data-timetable-id="' + escapeHtml(item.id) + '" data-completed="false">Mark complete</button>' +
        '<button type="button" class="btn secondary" data-timetable-action="delete" data-timetable-id="' + escapeHtml(item.id) + '">Delete</button></div></div></article>';
    }).join("");
  }

  function renderUpcomingEvents() {
    const feed = byId("campus-timetable-events-feed");
    if (!feed) return;
    const now = Date.now();
    const upcoming = campusEvents.filter((event) => event.starts_at && new Date(event.starts_at).getTime() >= now)
      .sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()).slice(0,5);
    if (!upcoming.length) {
      feed.innerHTML = '<div class="community-empty">No upcoming published events right now. Check Events & Campus Services for updates.</div>';
      return;
    }
    feed.innerHTML = upcoming.map((event) => {
      const date = new Date(event.starts_at);
      return '<article class="campus-timetable-event-card"><div class="campus-timetable-event-date"><strong>' + escapeHtml(String(date.getDate())) + '</strong><small>' + escapeHtml(date.toLocaleDateString([], { month: "short" })) + "</small></div>" +
        '<div class="campus-timetable-event-copy"><h4>' + escapeHtml(event.title || "Campus event") + '</h4><p>' +
        escapeHtml(formatDateTime(event.starts_at) + (event.location ? " · " + event.location : "")) + "</p></div>" +
        '<button type="button" class="btn secondary" data-page="events">Explore</button></article>';
    }).join("");
  }

  function updateSummary() {
    const weekDays = currentWeekDays();
    const timedClasses = timetableItems.filter((item) => item.kind === "class" && item.starts_at && !item.completed);
    const unsolvedTasks = timetableItems.filter((item) => !item.completed && item.kind !== "class");
    byId("campus-timetable-course-count").textContent = String(publishedCourses.length);
    byId("campus-timetable-class-count").textContent = String(timedClasses.length);
    byId("campus-timetable-task-count").textContent = String(unsolvedTasks.length);
    void weekDays;
  }

  function setCourseOptions() {
    const select = byId("campus-timetable-course");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Personal item (no course)</option>' + publishedCourses.map((course) =>
      '<option value="' + escapeHtml(course.id) + '">' +
      escapeHtml(course.course_code + " · " + course.title) + "</option>"
    ).join("");
    if (publishedCourses.some((course) => course.id === previous)) select.value = previous;
  }

  function renderAll() {
    renderCalendar();
    renderUnscheduledTasks();
    renderUpcomingEvents();
    updateSummary();
  }

  async function load(options = {}) {
    if (loading) return;
    loading = true;
    const refreshButton = byId("campus-timetable-refresh");
    if (refreshButton) refreshButton.disabled = true;
    status("Loading your private timetable…");
    try {
      const api = backend();
      campusContext = await api.getMyCampusContext();
      const items = await api.listMyTimetableItems();
      timetableItems = Array.isArray(items) ? items : [];
      publishedCourses = [];
      campusEvents = [];

      if (campusContext?.university_id) {
        try { publishedCourses = await api.listCampusCourses(); } catch (_) { publishedCourses = []; }
        try { campusEvents = await api.listCampusEvents(); } catch (_) { campusEvents = []; }
      }

      setCourseOptions();
      renderAll();
      status(campusContext?.university_id
        ? "Your private timetable is synced. Course links and campus events are scoped to your selected university."
        : "Your private timetable is synced. Choose your university in CampusPulse to link courses or view campus events.");
      startReminderChecks();
      if (options.keepMessage && byId("campus-timetable-form-status")) formStatus(options.keepMessage);
    } catch (error) {
      timetableItems = [];
      publishedCourses = [];
      campusEvents = [];
      setCourseOptions();
      renderAll();
      status(error?.message || "Could not load your timetable.", true);
      if (byId("campus-timetable-day-feed")) {
        byId("campus-timetable-day-feed").innerHTML = '<div class="campus-timetable-empty"><strong>Timetable unavailable</strong><p>Sign in with an account eligible to use the private planner, then refresh this page.</p></div>';
      }
    } finally {
      loading = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  function updateRepeatVisibility() {
    const repeat = byId("campus-timetable-repeat");
    const fields = byId("campus-timetable-repeat-fields");
    const kind = byId("campus-timetable-kind").value;
    if (kind !== "class" && repeat.checked) repeat.checked = false;
    repeat.disabled = kind !== "class";
    fields.hidden = !(kind === "class" && repeat.checked);
    if (fields.hidden) {
      document.querySelectorAll('input[name="campus-timetable-weekday"]').forEach((input) => { input.checked = false; });
      byId("campus-timetable-repeat-until").value = "";
    }
  }

  async function save(event) {
    event.preventDefault();
    const button = byId("campus-timetable-save");
    if (button) button.disabled = true;
    formStatus("Saving to your private timetable…");
    try {
      const api = backend();
      const title = byId("campus-timetable-title").value.trim();
      const kind = byId("campus-timetable-kind").value;
      const details = byId("campus-timetable-details").value.trim();
      const startRaw = byId("campus-timetable-start").value;
      const endRaw = byId("campus-timetable-end").value;
      const remindRaw = byId("campus-timetable-remind").value;
      const startsAt = toIso(startRaw);
      const endsAt = toIso(endRaw);
      const remindAt = toIso(remindRaw);
      const repeat = byId("campus-timetable-repeat").checked;
      const weekdays = repeat
        ? Array.from(document.querySelectorAll('input[name="campus-timetable-weekday"]:checked')).map((input) => Number(input.value))
        : [];
      const repeatUntil = repeat ? (byId("campus-timetable-repeat-until").value || null) : null;
      const courseId = byId("campus-timetable-course").value || null;
      const location = byId("campus-timetable-location").value.trim();

      if (title.length < 2 || title.length > 120) throw new Error("Title must be between 2 and 120 characters.");
      if (details.length > 1000) throw new Error("Notes must be 1,000 characters or fewer.");
      if (location.length > 180) throw new Error("Location must be 180 characters or fewer.");
      if (endsAt && (!startsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime())) {
        throw new Error("End time must be after the start time.");
      }
      if (repeat) {
        if (kind !== "class") throw new Error("Only classes can repeat weekly.");
        if (!startsAt) throw new Error("Choose the first class date and start time.");
        if (weekdays.length === 0) throw new Error("Choose at least one weekday for a repeating class.");
        if (repeatUntil && repeatUntil < dateKey(new Date(startsAt))) throw new Error("Repeat end date cannot be before the first class date.");
      }

      await api.createMyTimetableItem({
        title, kind, details, startsAt, endsAt, remindAt, location, weekdays, repeatUntil, courseId
      });
      const preserveKind = kind;
      byId("campus-timetable-form").reset();
      byId("campus-timetable-kind").value = preserveKind;
      updateRepeatVisibility();
      formStatus("Saved to your private timetable.");
      await load();
    } catch (error) {
      formStatus(error?.message || "Could not save this item.", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function onItemAction(event) {
    const button = event.target.closest("[data-timetable-action]");
    if (!button) return;
    const id = button.dataset.timetableId;
    const action = button.dataset.timetableAction;
    if (!id || !["toggle", "delete"].includes(action)) return;

    if (action === "delete" && !window.confirm("Delete this timetable item? This cannot be undone.")) return;
    button.disabled = true;
    try {
      const client = window.CampusShieldBackend?.client;
      if (!client) throw new Error("The secure backend is not configured.");
      let error = null;
      if (action === "toggle") {
        ({ error } = await client.rpc("update_my_shieldmind_planner_item", {
          p_item_id: id, p_completed: button.dataset.completed !== "true"
        }));
      } else {
        ({ error } = await client.rpc("delete_my_shieldmind_planner_item", { p_item_id: id }));
        notifiedReminderKeys.delete(id);
      }
      if (error) throw error;
      formStatus(action === "toggle" ? "Timetable item updated." : "Timetable item deleted.");
      await load();
    } catch (error) {
      formStatus(error?.message || "Could not update this timetable item.", true);
    } finally {
      button.disabled = false;
    }
  }

  function localReminderKey(item, occurrenceDate) {
    return item.id + ":" + dateKey(occurrenceDate || new Date(item.remind_at));
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      formStatus("This browser does not support notifications. Your schedule remains available in the app.", true);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        formStatus("Notifications were not enabled. You can change this in your browser settings.", true);
        return;
      }
      formStatus("Reminders enabled while CampusShield is open.");
      startReminderChecks();
      await checkReminders();
    } catch (error) {
      formStatus(error?.message || "Could not enable browser reminders.", true);
    }
  }

  async function checkReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted" || document.hidden) return;
    const now = Date.now();
    for (const item of timetableItems) {
      if (!item || item.completed || !item.remind_at) continue;
      const weekdays = weekdaysForItem(item);
      if (weekdays.length && item.kind === "class" && item.starts_at) {
        const startSeed = new Date(item.starts_at).getTime();
        const remindSeed = new Date(item.remind_at).getTime();
        if (!Number.isFinite(startSeed) || !Number.isFinite(remindSeed)) continue;
        const offset = remindSeed - startSeed;
        for (let delta = -1; delta <= 7; delta++) {
          const day = addDays(new Date(), delta);
          const key = dateKey(day);
          const occurrenceStart = recurringStartForDate(item, day);
          if (!occurrenceStart) continue;
          const dueAt = occurrenceStart.getTime() + offset;
          const reminderKey = localReminderKey(item, day);
          if (dueAt <= now && dueAt >= now - 24 * 60 * 60 * 1000 && !notifiedReminderKeys.has(reminderKey)) {
            new Notification("CampusShield timetable reminder", {
              body: String(item.title || "Scheduled class").slice(0, 180),
              tag: "campusshield-timetable-" + reminderKey
            });
            notifiedReminderKeys.add(reminderKey);
          }
        }
      } else {
        const dueAt = new Date(item.remind_at).getTime();
        const reminderKey = localReminderKey(item);
        if (Number.isFinite(dueAt) && dueAt <= now && dueAt >= now - 24 * 60 * 60 * 1000 && !notifiedReminderKeys.has(reminderKey)) {
          new Notification("CampusShield timetable reminder", {
            body: String(item.title || "Your scheduled item").slice(0, 180),
            tag: "campusshield-timetable-" + reminderKey
          });
          notifiedReminderKeys.add(reminderKey);
        }
      }
    }
  }

  function startReminderChecks() {
    if (reminderTimer !== null) return;
    reminderTimer = window.setInterval(checkReminders, 60000);
  }

  function escapeCalendarText(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function calendarUtcStamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Calendar export encountered an invalid date.");
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function foldCalendarLine(line) {
    const segments = [];
    let segment = "";
    let byteLength = 0;
    for (const character of String(line)) {
      const characterBytes = new TextEncoder().encode(character).length;
      const limit = segments.length ? 74 : 75;
      if (byteLength + characterBytes > limit && segment) {
        segments.push(segment);
        segment = " " + character;
        byteLength = 1 + characterBytes;
      } else {
        segment += character;
        byteLength += characterBytes;
      }
    }
    segments.push(segment);
    return segments.join("\r\n");
  }

  function appendCalendarEvent(lines, event) {
    const safeUid = String(event.uid || "item-" + Date.now()).replace(/[^a-zA-Z0-9._-]/g, "-");
    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const requestedEnd = event.end ? (event.end instanceof Date ? event.end : new Date(event.end)) : null;
    const end = requestedEnd && !Number.isNaN(requestedEnd.getTime()) && requestedEnd > start
      ? requestedEnd
      : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + safeUid + "@campusshieldai.com",
      "DTSTAMP:" + calendarUtcStamp(new Date()),
      "DTSTART:" + calendarUtcStamp(start),
      "DTEND:" + calendarUtcStamp(end),
      "SUMMARY:" + escapeCalendarText(event.title || "CampusShield scheduled item")
    );
    if (event.description) lines.push("DESCRIPTION:" + escapeCalendarText(event.description));
    if (event.location) lines.push("LOCATION:" + escapeCalendarText(event.location));
    if (event.category) lines.push("CATEGORIES:" + escapeCalendarText(event.category));
    lines.push("END:VEVENT");
  }

  function downloadCalendar() {
    const now = new Date();
    const firstDay = startOfDay(now);
    const lastDay = addDays(firstDay, CALENDAR_EXPORT_DAYS);
    lastDay.setHours(23, 59, 59, 999);
    const events = [];

    function addIfUpcoming(event) {
      const start = event.start instanceof Date ? event.start : new Date(event.start);
      if (Number.isNaN(start.getTime()) || start < now || start > lastDay) return;
      events.push({ ...event, start });
    }

    timetableItems.forEach((item) => {
      if (!item || item.completed || !item.starts_at) return;
      const weekdays = weekdaysForItem(item);
      const label = kindLabels[item.kind] || "Timetable item";
      const course = [item.course_code, item.course_title].filter(Boolean).join(" · ");
      const description = [course, item.details].filter(Boolean).join("\n");

      if (item.kind === "class" && weekdays.length) {
        for (let offset = 0; offset <= CALENDAR_EXPORT_DAYS; offset += 1) {
          const date = addDays(firstDay, offset);
          const occurrence = occurrenceForItem(item, date);
          if (!occurrence?.recurring) continue;
          addIfUpcoming({
            uid: "planner-" + item.id + "-" + dateKey(date),
            title: "[Class] " + String(item.title || "Class"),
            description,
            location: item.location || "",
            category: label,
            start: occurrence.start,
            end: occurrence.end || new Date(occurrence.start.getTime() + 60 * 60 * 1000)
          });
        }
        return;
      }

      const start = new Date(item.starts_at);
      if (Number.isNaN(start.getTime())) return;
      addIfUpcoming({
        uid: "planner-" + item.id,
        title: "[" + label + "] " + String(item.title || "Timetable item"),
        description,
        location: item.location || "",
        category: label,
        start,
        end: item.ends_at ? new Date(item.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
      });
    });

    campusEvents.forEach((event) => {
      if (!event?.starts_at) return;
      const start = new Date(event.starts_at);
      if (Number.isNaN(start.getTime())) return;
      addIfUpcoming({
        uid: "campus-event-" + event.id,
        title: "[Campus event] " + String(event.title || "Campus event"),
        description: [event.category, event.organizer_username ? "Organizer: @" + event.organizer_username : ""].filter(Boolean).join("\n"),
        location: event.location || "",
        category: "Campus event",
        start,
        end: event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
      });
    });

    if (!events.length) {
      formStatus("No upcoming timed classes, tasks, or campus events found for the next " + CALENDAR_EXPORT_DAYS + " days.", true);
      return;
    }

    events.sort((left, right) => left.start.getTime() - right.start.getTime());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CampusShield AI//Academic Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:CampusShield AI Schedule"
    ];
    events.forEach((event) => appendCalendarEvent(lines, event));
    lines.push("END:VCALENDAR");

    const calendarText = lines.map(foldCalendarLine).join("\r\n") + "\r\n";
    const blob = new Blob([calendarText], { type: "text/calendar;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "campusshield-calendar-" + dateKey(now) + ".ics";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    formStatus("Exported " + events.length + " upcoming item(s). Import the .ics file into Google Calendar, Apple Calendar, or Outlook.");
  }

  function init() {
    byId("campus-timetable-form")?.addEventListener("submit", save);
    byId("campus-timetable-refresh")?.addEventListener("click", () => load());
    byId("campus-timetable-export-calendar")?.addEventListener("click", downloadCalendar);
    byId("campus-timetable-prev-week")?.addEventListener("click", () => setWeek(addDays(weekStart, -7), addDays(selectedDate, -7)));
    byId("campus-timetable-next-week")?.addEventListener("click", () => setWeek(addDays(weekStart, 7), addDays(selectedDate, 7)));
    byId("campus-timetable-today")?.addEventListener("click", () => setWeek(new Date(), new Date()));
    byId("campus-timetable-repeat")?.addEventListener("change", updateRepeatVisibility);
    byId("campus-timetable-kind")?.addEventListener("change", updateRepeatVisibility);
    byId("campus-timetable-notifications")?.addEventListener("click", enableNotifications);
    byId("campus-timetable-day-feed")?.addEventListener("click", onItemAction);
    byId("campus-timetable-unscheduled-feed")?.addEventListener("click", onItemAction);
    window.addEventListener("campusshield:session-changed", () => {
      timetableItems = [];
      publishedCourses = [];
      campusEvents = [];
      load();
    });
    updateRepeatVisibility();
    renderCalendar();
  }

  window.CampusShieldTimetable = { load };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();