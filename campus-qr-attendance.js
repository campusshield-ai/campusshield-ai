(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const backend = () => window.CampusShieldBackend;
  let activeQrTimer = null;
  let activeCountdownTimer = null;
  let rosterTimer = null;
  let activeStream = null;
  let scanLoopTimer = null;
  let renderSequence = 0;
  let currentQrSession = null;
  let pendingDeepLinkInMemory = null;
  const pendingDeepLinkStorageKey = "campusshield:attendance:pending:v1";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function asRows(value) {
    return Array.isArray(value) ? value : (value ? [value] : []);
  }

  function clearQrTimers() {
    if (activeQrTimer) clearInterval(activeQrTimer);
    if (activeCountdownTimer) clearInterval(activeCountdownTimer);
    if (rosterTimer) clearInterval(rosterTimer);
    activeQrTimer = null;
    activeCountdownTimer = null;
    rosterTimer = null;
  }

  function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], {
      dateStyle: "medium", timeStyle: "short"
    });
  }

  function statusBadge(status) {
    const value = String(status || "not recorded").toLowerCase();
    return '<span class="campus-attendance-status" data-status="' + escapeHtml(value) + '">' +
      escapeHtml(value === "not recorded" ? "Not recorded" : value) + "</span>";
  }

  function isSessionOpen(session) {
    return !session.attendance_closed_at &&
      new Date(session.attendance_window_ends_at).getTime() > Date.now();
  }

  function stopScanner() {
    if (scanLoopTimer) clearTimeout(scanLoopTimer);
    scanLoopTimer = null;
    if (activeStream) activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
    const video = $("campus-attendance-camera");
    if (video) video.srcObject = null;
  }

  function setPanelMessage(panel, message, kind) {
    const el = panel && panel.querySelector("[data-attendance-message]");
    if (!el) return;
    el.textContent = message || "";
    if (kind) el.dataset.kind = kind;
    else delete el.dataset.kind;
  }

  async function renderAttendancePanel(classroomId) {
    const panel = $("campus-attendance-panel");
    if (!panel) return;
    clearQrTimers();
    stopScanner();
    currentQrSession = null;
    const sequence = ++renderSequence;
    panel.dataset.classroomId = classroomId;
    panel.innerHTML = '<div class="community-empty" role="status">Checking your attendance permissions…</div>';

    try {
      const api = backend();
      const capabilities = await api.getCampusClassAttendanceCapabilities(classroomId);
      if (sequence !== renderSequence || !$("campus-attendance-panel")) return;
      if (!capabilities || !capabilities.can_access) {
        panel.innerHTML = '<p class="campus-attendance-muted">Attendance tools are not available for this classroom.</p>';
        return;
      }

      if (capabilities.can_manage) {
        const sessions = asRows(await api.listCampusClassAttendanceSessions(classroomId));
        if (sequence !== renderSequence || !$("campus-attendance-panel")) return;
        renderManagerPanel(panel, classroomId, capabilities, sessions);
      } else {
        const records = asRows(await api.getMyCampusClassAttendance(classroomId));
        if (sequence !== renderSequence || !$("campus-attendance-panel")) return;
        renderStudentPanel(panel, classroomId, capabilities, records);
      }
    } catch (error) {
      if (sequence !== renderSequence) return;
      panel.innerHTML = '<h3>Class attendance</h3><p class="campus-attendance-muted">Attendance could not be loaded. Your existing classroom access has not changed.</p><p class="message" role="status">' +
        escapeHtml(error && error.message || "Please refresh and try again.") + '</p>';
    }
  }

  function renderManagerPanel(panel, classroomId, capabilities, sessions) {
    const activeCount = sessions.filter(isSessionOpen).length;
    panel.dataset.classroomId = classroomId;
    panel.innerHTML = `
      <div class="panel-heading">
        <div><h3>Class attendance</h3><p class="campus-attendance-muted">Create a time-limited check-in session, display its rotating QR code and monitor the enrolled class roster.</p></div>
        <span class="campus-attendance-status" data-status="present">${activeCount} open</span>
      </div>
      <form id="campus-attendance-create-form">
        <div class="field"><label for="campus-attendance-title">Session title *</label><input id="campus-attendance-title" required minlength="2" maxlength="160" placeholder="e.g. CSC 201 — Week 4 lecture"></div>
        <div class="campus-attendance-form-grid">
          <div class="field"><label for="campus-attendance-window">Check-in window</label><select id="campus-attendance-window"><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120" selected>2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></div>
          <div class="field"><label for="campus-attendance-late">Mark late after</label><select id="campus-attendance-late"><option value="10">10 minutes</option><option value="15" selected>15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option></select></div>
          <div class="field"><button class="btn" type="submit">Create attendance session</button></div>
        </div>
        <p class="campus-attendance-muted">Students must be enrolled, verified members of this university. A QR code expires after 45 seconds and refreshes automatically. Re-scanning never creates a duplicate check-in. QR check-in records the account and scan time; it does not independently prove physical presence, so lecturers should supervise the session.</p>
        <p class="message campus-attendance-message" data-attendance-message role="status" aria-live="polite"></p>
      </form>
      <div class="campus-attendance-sessions" data-attendance-sessions>
        ${sessions.length ? sessions.map(session => `
          <article class="campus-attendance-session">
            <div><h4>${escapeHtml(session.title)}</h4><p>${escapeHtml(formatTime(session.created_at))} · ${Number(session.checked_in_count || 0)} checked in · ${Number(session.present_count || 0)} present · ${Number(session.late_count || 0)} late</p><p>${isSessionOpen(session) ? "Check-in closes " + escapeHtml(formatTime(session.attendance_window_ends_at)) : "Attendance closed"}</p></div>
            <div class="campus-attendance-actions">
              ${isSessionOpen(session) ? '<button class="btn secondary" type="button" data-attendance-show-qr="' + escapeHtml(session.session_id) + '" data-session-title="' + escapeHtml(session.title) + '">Display QR</button>' : ''}
              <button class="btn secondary" type="button" data-attendance-roster="${escapeHtml(session.session_id)}">View register</button>
              ${isSessionOpen(session) ? '<button class="btn secondary" type="button" data-attendance-close="' + escapeHtml(session.session_id) + '">Close check-in</button>' : ''}
            </div>
          </article>`).join("") : '<div class="community-empty">No attendance sessions yet. Create one when class begins.</div>'}
      </div>
      <div id="campus-attendance-display" aria-live="polite"></div>
      <div id="campus-attendance-register" aria-live="polite"></div>
    `;

    const form = $("campus-attendance-create-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      setPanelMessage(panel, "Creating attendance session…");
      try {
        await backend().createCampusClassAttendanceSession(
          classroomId,
          $("campus-attendance-title").value.trim(),
          Number($("campus-attendance-window").value),
          Number($("campus-attendance-late").value)
        );
        await renderAttendancePanel(classroomId);
        const freshPanel = $("campus-attendance-panel");
        setPanelMessage(freshPanel, "Attendance session created. Display its QR code when students are ready.", "success");
      } catch (error) {
        submit.disabled = false;
        setPanelMessage(panel, error.message || "Could not create the attendance session.", "error");
      }
    });

    if (panel.dataset.managerHandlerBound !== "1") {
      panel.dataset.managerHandlerBound = "1";
      panel.addEventListener("click", async function handler(event) {
      const showQr = event.target.closest("[data-attendance-show-qr]");
      const showRoster = event.target.closest("[data-attendance-roster]");
      const close = event.target.closest("[data-attendance-close]");
      const exportButton = event.target.closest("[data-attendance-export]");
      if (!showQr && !showRoster && !close && !exportButton) return;

      if (showQr) {
        await displayQr(showQr.dataset.attendanceShowQr, showQr.dataset.sessionTitle || "Class attendance", panel.dataset.classroomId);
      } else if (showRoster) {
        await showRosterForSession(showRoster.dataset.attendanceRoster);
      } else if (close) {
        if (!window.confirm("Close check-in for this class session? Students will no longer be able to scan its QR code.")) return;
        close.disabled = true;
        try {
          await backend().closeCampusClassAttendanceSession(close.dataset.attendanceClose);
          await renderAttendancePanel(panel.dataset.classroomId);
          setPanelMessage($("campus-attendance-panel"), "Attendance is closed. The QR token has been invalidated.", "success");
        } catch (error) {
          close.disabled = false;
          setPanelMessage(panel, error.message || "Could not close attendance.", "error");
        }
      } else if (exportButton) {
        exportRosterCsv(exportButton.dataset.attendanceExport);
      }
      });
    }
  }

  async function displayQr(sessionId, title, classroomId) {
    const panel = $("campus-attendance-panel");
    const display = $("campus-attendance-display");
    if (!panel || !display) return;
    clearQrTimers();
    currentQrSession = { sessionId, title, classroomId };
    display.innerHTML = `
      <div class="campus-attendance-qr-shell">
        <strong>${escapeHtml(title)}</strong>
        <div data-attendance-qr-image role="img" aria-label="Rotating class attendance QR code"><p class="campus-attendance-muted">Preparing QR code…</p></div>
        <div class="campus-attendance-countdown" data-attendance-countdown>Preparing secure QR…</div>
        <p class="campus-attendance-muted">Each QR expires after 45 seconds and is replaced automatically. Students must scan the current code while signed in to CampusShield.</p>
        <button class="btn secondary" type="button" data-attendance-hide-qr>Hide QR code</button>
      </div>`;
    const hide = display.querySelector("[data-attendance-hide-qr]");
    hide.addEventListener("click", () => { clearQrTimers(); display.replaceChildren(); currentQrSession = null; });

    const refresh = async () => {
      if (!currentQrSession || currentQrSession.sessionId !== sessionId) return;
      const slot = display.querySelector("[data-attendance-qr-image]");
      const countdown = display.querySelector("[data-attendance-countdown]");
      if (!slot || !countdown) return;
      countdown.textContent = "Refreshing secure QR…";
      try {
        const token = await backend().issueCampusClassAttendanceQrToken(sessionId);
        if (!currentQrSession || currentQrSession.sessionId !== sessionId || !slot.isConnected) return;
        if (!token || !token.qr_token || !token.expires_at) throw new Error("The QR service did not return a valid token.");
        const url = new URL(window.location.href);
        url.searchParams.set("attendance_session", sessionId);
        url.searchParams.set("attendance_token", token.qr_token);
        const qr = window.qrcode(0, "M");
        qr.addData(url.toString());
        qr.make();
        slot.innerHTML = qr.createSvgTag({
          cellSize: 5, margin: 3, scalable: true,
          title: "CampusShield class attendance",
          alt: "Temporary attendance check-in QR code"
        });
        const expiresAt = new Date(token.expires_at).getTime();
        const renderCountdown = () => {
          if (!countdown.isConnected) return;
          const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
          countdown.textContent = seconds > 0 ? "QR refreshes in " + seconds + "s" : "Refreshing secure QR…";
        };
        renderCountdown();
        if (activeCountdownTimer) clearInterval(activeCountdownTimer);
        activeCountdownTimer = setInterval(renderCountdown, 1000);
      } catch (error) {
        slot.textContent = error.message || "Could not refresh QR code.";
      }
    };

    await refresh();
    activeQrTimer = setInterval(refresh, 35000);
    rosterTimer = setInterval(async () => {
      if (!currentQrSession || currentQrSession.sessionId !== sessionId) return;
      try {
        const sessions = await backend().listCampusClassAttendanceSessions(classroomId);
        const current = sessions.find(item => item.session_id === sessionId);
        const badge = panel.querySelector(".panel-heading .campus-attendance-status");
        if (badge && current) badge.textContent = Number(current.checked_in_count || 0) + " checked in";
      } catch (_) {}
    }, 8000);
  }

  async function showRosterForSession(sessionId) {
    const target = $("campus-attendance-register");
    if (!target) return;
    target.innerHTML = '<p class="campus-attendance-muted" role="status">Loading the class register…</p>';
    try {
      const roster = asRows(await backend().listCampusClassAttendanceRoster(sessionId));
      const rows = roster.map(student => `
        <tr>
          <td>${escapeHtml(student.display_name || "Student")}</td>
          <td>${statusBadge(student.status || "not recorded")}</td>
          <td>${escapeHtml(formatTime(student.marked_at))}</td>
          <td>${escapeHtml(student.attendance_method || "—")}</td>
        </tr>`).join("");
      target.innerHTML = `
        <div class="campus-attendance-session" style="margin-top:14px">
          <div><h4>Class attendance register</h4><p>${roster.filter(row => row.status).length} of ${roster.length} enrolled students checked in.</p></div>
          <button class="btn secondary" type="button" data-attendance-export="${escapeHtml(sessionId)}">Export CSV</button>
        </div>
        <div class="campus-attendance-roster-wrap">
          <table class="campus-attendance-roster">
            <thead><tr><th>Student</th><th>Status</th><th>Check-in time</th><th>Method</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No enrolled students in this class yet.</td></tr>'}</tbody>
          </table>
        </div>`;
    } catch (error) {
      target.textContent = error.message || "The attendance register could not be loaded.";
    }
  }

  async function exportRosterCsv(sessionId) {
    try {
      const roster = asRows(await backend().listCampusClassAttendanceRoster(sessionId));
      const quote = value => {
        const text = String(value == null ? "" : value).replace(/[\\r\\n]+/g, " ");
        const safe = /^[\\t ]*[=+\\-@]/.test(text) ? "'" + text : text;
        return '"' + safe.replace(/"/g, '""') + '"';
      };
      const csv = [
        ["Student", "Status", "Check-in time", "Method"].map(quote).join(","),
        ...roster.map(row => [row.display_name, row.status || "not recorded", row.marked_at, row.attendance_method].map(quote).join(","))
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "campusshield-attendance-" + sessionId.slice(0, 8) + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const panel = $("campus-attendance-panel");
      setPanelMessage(panel, error.message || "Could not export the attendance list.", "error");
    }
  }

  function renderStudentPanel(panel, classroomId, capabilities, records) {
    panel.dataset.classroomId = classroomId;
    panel.innerHTML = `
      <div class="panel-heading"><div><h3>My class attendance</h3><p class="campus-attendance-muted">Your personal attendance record for ${escapeHtml(capabilities.classroom_title || "this class")}.</p></div></div>
      <p class="campus-attendance-muted">Scan the temporary QR displayed by your lecturer. Check-in is available only to verified students already enrolled in this classroom. CampusShield does not use a selfie or continuous location tracking for this check-in.</p>
      <div class="campus-attendance-sessions">
        ${records.length ? records.map(record => `
          <article class="campus-attendance-session">
            <div><h4>${escapeHtml(record.title)}</h4><p>${escapeHtml(formatTime(record.created_at))}</p><p>${record.marked_at ? "Recorded " + escapeHtml(formatTime(record.marked_at)) : "No check-in recorded"}</p></div>
            <div>${statusBadge(record.status || "not recorded")}</div>
          </article>`).join("") : '<div class="community-empty">No attendance sessions have been created for this class yet.</div>'}
      </div>
      <div class="campus-attendance-actions" style="margin-top:14px">
        <button class="btn" type="button" data-attendance-start-scan>Scan lecturer QR code</button>
        <button class="btn secondary" type="button" data-attendance-refresh-student>Refresh my record</button>
      </div>
      <div id="campus-attendance-student-message" class="message campus-attendance-message" role="status" aria-live="polite"></div>
      <div id="campus-attendance-scanner" class="campus-attendance-scanner" hidden>
        <video id="campus-attendance-camera" autoplay playsinline muted></video>
        <p class="campus-attendance-muted" data-scan-support></p>
        <button class="btn secondary" type="button" data-attendance-stop-scan>Stop camera</button>
      </div>`;

    if (panel.dataset.studentHandlerBound !== "1") {
      panel.dataset.studentHandlerBound = "1";
      panel.addEventListener("click", async function handler(event) {
      if (event.target.closest("[data-attendance-start-scan]")) {
        await startScanner(panel.dataset.classroomId, panel);
      } else if (event.target.closest("[data-attendance-stop-scan]")) {
        stopScanner();
        const scanner = $("campus-attendance-scanner");
        if (scanner) scanner.hidden = true;
      } else if (event.target.closest("[data-attendance-refresh-student]")) {
        await renderAttendancePanel(panel.dataset.classroomId);
      }
      });
    }
  }

  async function startScanner(classroomId, panel) {
    const scanner = $("campus-attendance-scanner");
    const video = $("campus-attendance-camera");
    const note = panel.querySelector("[data-scan-support]");
    const message = $("campus-attendance-student-message");
    if (!scanner || !video || !note) return;
    scanner.hidden = false;
    if (!("BarcodeDetector" in window)) {
      note.textContent = "This browser does not support in-page QR scanning. Open your phone's Camera app, point it at the lecturer's displayed QR and tap the CampusShield link. The check-in will complete after you sign in. Use a supported Chrome browser for scanning inside the app.";
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      note.textContent = "Camera access is unavailable in this browser. Use your phone's Camera app to scan the lecturer's QR link.";
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });
      video.srcObject = activeStream;
      await video.play();
      note.textContent = "Hold the current lecturer QR code inside the camera frame.";
      const scan = async () => {
        if (!activeStream || scanner.hidden) return;
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes.length && codes[0].rawValue) {
              const credentials = parseAttendanceQr(codes[0].rawValue);
              if (credentials) {
                stopScanner();
                scanner.hidden = true;
                await completeCheckIn(credentials.sessionId, credentials.token, classroomId, message).catch(() => {});
                return;
              }
            }
          } catch (_) {}
        }
        scanLoopTimer = setTimeout(scan, 280);
      };
      scan();
    } catch (error) {
      note.textContent = error && error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access or use your phone's Camera app to scan the lecturer's QR link."
        : "The camera could not start. Use your phone's Camera app to scan the lecturer's QR link.";
    }
  }

  function parseAttendanceQr(rawValue) {
    try {
      const url = new URL(rawValue, window.location.href);
      if (url.origin !== window.location.origin) return null;
      const sessionId = url.searchParams.get("attendance_session");
      const token = url.searchParams.get("attendance_token");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId || "")) return null;
      if (!/^[0-9a-f]{64}$/.test(token || "")) return null;
      return { sessionId, token };
    } catch (_) {
      return null;
    }
  }

  async function completeCheckIn(sessionId, token, classroomId, output) {
    const target = output || $("campus-attendance-deep-link-message");
    if (target) target.textContent = "Verifying your attendance QR…";
    try {
      const result = await backend().checkInCampusClassAttendance(sessionId, token);
      const when = formatTime(result.marked_at);
      const already = Boolean(result.already_recorded);
      const message = already
        ? "You were already checked in for " + result.session_title + " at " + when + ". No duplicate record was created."
        : "Attendance recorded for " + result.session_title + " (" + result.status + ") at " + when + ".";
      if (target) {
        target.hidden = false;
        target.textContent = message;
        target.classList.add("campus-attendance-receipt");
      }
      const nav = document.querySelector('[data-page="classroom"]');
      if (nav && typeof nav.click === "function") nav.click();
      if (classroomId) setTimeout(() => renderAttendancePanel(classroomId), 200);
      return result;
    } catch (error) {
      if (target) target.textContent = error.message || "Attendance check-in could not be completed.";
      throw error;
    }
  }

  function showDeepLinkMessage(message, kind) {
    const target = $("campus-attendance-deep-link-message");
    if (!target) return;
    target.hidden = false;
    target.textContent = message;
    target.dataset.kind = kind || "info";
  }

  function captureAttendanceDeepLink() {
    try {
      const url = new URL(window.location.href);
      const hasAttendanceParams = url.searchParams.has("attendance_session") ||
        url.searchParams.has("attendance_token");
      if (!hasAttendanceParams) return;

      const credentials = parseAttendanceQr(url.toString());
      url.searchParams.delete("attendance_session");
      url.searchParams.delete("attendance_token");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

      const pending = credentials
        ? { sessionId: credentials.sessionId, token: credentials.token, capturedAt: Date.now() }
        : { invalid: true, capturedAt: Date.now() };
      pendingDeepLinkInMemory = pending;
      try {
        sessionStorage.setItem(pendingDeepLinkStorageKey, JSON.stringify(pending));
      } catch (_) {
        // The in-memory copy remains available for this page session.
      }
    } catch (_) {
      // Ignore malformed URLs; the check-in RPC remains the authority.
    }
  }

  function consumeAttendanceDeepLink() {
    let pending = pendingDeepLinkInMemory;
    pendingDeepLinkInMemory = null;
    try {
      const stored = sessionStorage.getItem(pendingDeepLinkStorageKey);
      if (stored) {
        sessionStorage.removeItem(pendingDeepLinkStorageKey);
        pending = JSON.parse(stored);
      }
    } catch (_) {
      try { sessionStorage.removeItem(pendingDeepLinkStorageKey); } catch (_) {}
    }
    if (!pending || typeof pending !== "object") return null;
    if (pending.invalid) return { invalid: true };
    if (!pending.sessionId || !pending.token ||
        !Number.isFinite(Number(pending.capturedAt)) ||
        Date.now() - Number(pending.capturedAt) > 60000) return { expired: true };
    const checked = parseAttendanceQr((() => {
      const url = new URL(window.location.href);
      url.searchParams.set("attendance_session", String(pending.sessionId));
      url.searchParams.set("attendance_token", String(pending.token));
      return url.toString();
    })());
    return checked || { invalid: true };
  }

  async function handleAttendanceDeepLink() {
    const credentials = consumeAttendanceDeepLink();
    if (!credentials) return;
    if (credentials.expired) {
      showDeepLinkMessage("This QR link has expired. Sign in, then scan the lecturer's latest code.", "error");
      return;
    }
    if (credentials.invalid) {
      showDeepLinkMessage("This attendance link is invalid. Scan the lecturer's latest QR code.", "error");
      return;
    }
    try {
      await completeCheckIn(credentials.sessionId, credentials.token, null, $("campus-attendance-deep-link-message"));
    } catch (error) {
      showDeepLinkMessage(error.message || "Attendance check-in could not be completed.", "error");
    }
  }

  captureAttendanceDeepLink();

  window.addEventListener("campusshield:classroom-detail-loaded", (event) => {
    const classroomId = event.detail && event.detail.classroomId;
    if (classroomId) renderAttendancePanel(classroomId);
  });

  window.addEventListener("campusshield:profile-ready", () => {
    void handleAttendanceDeepLink();
  });

  window.addEventListener("campusshield:profile-cleared", () => {
    clearQrTimers();
    stopScanner();
    currentQrSession = null;
    const message = $("campus-attendance-deep-link-message");
    if (message) { message.hidden = true; message.textContent = ""; }
  });

  document.addEventListener("click", (event) => {
    const closeDetail = event.target.closest("#close-classroom-detail");
    const pageButton = event.target.closest("[data-page]");
    if (closeDetail || (pageButton && pageButton.dataset.page !== "classroom")) {
      clearQrTimers();
      stopScanner();
      currentQrSession = null;
      renderSequence += 1;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearQrTimers();
      stopScanner();
    } else if (currentQrSession) {
      const session = currentQrSession;
      void displayQr(session.sessionId, session.title, session.classroomId);
    }
  });
})();
