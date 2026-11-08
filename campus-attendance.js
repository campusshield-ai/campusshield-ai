(() => {
  "use strict";

  const QR_TYPE = "campusshield-class-attendance";
  const QR_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
  let root = null;
  let classroomId = "";
  let generation = 0;
  let qrSessionId = "";
  let qrCard = null;
  let qrPayload = "";
  let qrExpiry = 0;
  let qrRefreshTimer = 0;
  let qrCountdownTimer = 0;
  let qrLibraryPromise = null;
  let cameraStream = null;
  let cameraVideo = null;
  let cameraFrame = 0;
  let cameraBusy = false;

  const one = (selector, scope) => (scope || document).querySelector(selector);
  const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);

  function getClient() {
    const client = window.CampusShieldBackend && window.CampusShieldBackend.client;
    if (!client || typeof client.rpc !== "function") {
      throw new Error("Campus attendance is not connected. Refresh the page and try again.");
    }
    return client;
  }

  async function callRpc(name, args) {
    const result = await getClient().rpc(name, args || {});
    if (result.error) throw result.error;
    return result.data;
  }

  function firstRow(value) {
    return Array.isArray(value) ? (value[0] || null) : value;
  }

  function setMessage(node, message, isError) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(isError));
  }

  function dateText(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : "Time unavailable";
  }

  function localDate() {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function stopQrTimers() {
    if (qrRefreshTimer) window.clearTimeout(qrRefreshTimer);
    if (qrCountdownTimer) window.clearInterval(qrCountdownTimer);
    qrRefreshTimer = 0;
    qrCountdownTimer = 0;
  }

  function hideQr() {
    stopQrTimers();
    if (qrCard) {
      const image = one("[data-attendance-qr-image]", qrCard);
      const display = one("[data-attendance-qr-display]", qrCard);
      if (image) image.removeAttribute("src");
      if (display) display.hidden = true;
      setMessage(one("[data-attendance-qr-status]", qrCard), "QR code hidden.", false);
    }
    qrSessionId = "";
    qrCard = null;
    qrPayload = "";
    qrExpiry = 0;
  }

  function stopCamera() {
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    cameraBusy = false;
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    if (cameraVideo) {
      cameraVideo.pause();
      cameraVideo.srcObject = null;
      cameraVideo.hidden = true;
    }
    cameraVideo = null;
    const video = root && one("[data-attendance-camera-video]", root);
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }
    const start = root && one("[data-attendance-start-camera]", root);
    const stop = root && one("[data-attendance-stop-camera]", root);
    if (start) start.hidden = false;
    if (stop) stop.hidden = true;
  }

  function teardown() {
    generation += 1;
    stopCamera();
    hideQr();
    classroomId = "";
    root = null;
  }

  function loadQrLibrary() {
    if (typeof window.qrcode === "function") return Promise.resolve();
    if (qrLibraryPromise) return qrLibraryPromise;
    qrLibraryPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-campus-attendance-qr-library="true"]');
      if (script) {
        script.addEventListener("load", () => typeof window.qrcode === "function" ? resolve() : reject(new Error("QR generator did not initialise.")), { once: true });
        script.addEventListener("error", () => reject(new Error("QR generator could not be loaded. Check your connection and retry.")), { once: true });
        return;
      }
      script = document.createElement("script");
      script.src = QR_SCRIPT;
      script.async = true;
      script.dataset.campusAttendanceQrLibrary = "true";
      script.onload = () => typeof window.qrcode === "function" ? resolve() : reject(new Error("QR generator did not initialise."));
      script.onerror = () => reject(new Error("QR generator could not be loaded. Check your connection and retry."));
      document.head.appendChild(script);
    }).catch(error => {
      qrLibraryPromise = null;
      throw error;
    });
    return qrLibraryPromise;
  }

  async function qrImage(payload) {
    await loadQrLibrary();
    const qr = window.qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    return qr.createDataURL(6, 8);
  }

  function qrCountdown(card) {
    if (qrCountdownTimer) window.clearInterval(qrCountdownTimer);
    const label = one("[data-attendance-qr-countdown]", card);
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((qrExpiry - Date.now()) / 1000));
      if (label) label.textContent = seconds ? "Refreshes in " + seconds + "s" : "Refreshing secure code…";
    };
    tick();
    qrCountdownTimer = window.setInterval(tick, 500);
  }

  async function issueQr(sessionId, card) {
    if (!card || !card.isConnected || !classroomId || document.visibilityState === "hidden") return;
    stopQrTimers();
    setMessage(one("[data-attendance-qr-status]", card), "Creating a short-lived QR code…", false);
    try {
      const tokenRow = firstRow(await callRpc("issue_campus_class_attendance_qr_token", { p_session_id: sessionId }));
      const token = String(tokenRow && tokenRow.qr_token || "");
      const expiry = new Date(tokenRow && tokenRow.expires_at || "").getTime();
      if (!/^[0-9a-f]{64}$/.test(token) || !Number.isFinite(expiry) || expiry <= Date.now()) {
        throw new Error("The attendance service did not return a valid QR token.");
      }
      const payload = JSON.stringify({ type: QR_TYPE, v: 1, sessionId: sessionId, token: token });
      const dataUrl = await qrImage(payload);
      if (!card.isConnected || !classroomId) return;
      const image = one("[data-attendance-qr-image]", card);
      const display = one("[data-attendance-qr-display]", card);
      if (image) image.src = dataUrl;
      if (display) display.hidden = false;
      qrSessionId = sessionId;
      qrCard = card;
      qrPayload = payload;
      qrExpiry = expiry;
      setMessage(one("[data-attendance-qr-status]", card), "Secure QR ready. Expires at " + dateText(expiry) + ".", false);
      qrCountdown(card);
      const delay = Math.max(2500, Math.min(35000, expiry - Date.now() - 6000));
      qrRefreshTimer = window.setTimeout(() => { void issueQr(sessionId, card); }, delay);
    } catch (error) {
      const image = one("[data-attendance-qr-image]", card);
      if (image) image.removeAttribute("src");
      setMessage(one("[data-attendance-qr-status]", card), error.message || "Could not create a QR code.", true);
    }
  }

  function parseQr(raw) {
    let value;
    try { value = JSON.parse(String(raw || "").trim()); }
    catch { throw new Error("That QR code is not a CampusShield attendance code."); }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!value || value.type !== QR_TYPE || value.v !== 1 ||
        typeof value.sessionId !== "string" || !uuid.test(value.sessionId) ||
        typeof value.token !== "string" || !/^[0-9a-f]{64}$/.test(value.token)) {
      throw new Error("This code is incomplete or is not a valid CampusShield attendance QR.");
    }
    return value;
  }

  function renderSession(row) {
    const id = escapeHtml(row.session_id);
    const expired = row.attendance_closed_at ||
      (Number.isFinite(new Date(row.attendance_window_ends_at).getTime()) &&
       new Date(row.attendance_window_ends_at).getTime() <= Date.now());
    const closed = Boolean(expired);
    return [
      '<article class="campus-attendance-session" data-attendance-card="', id, '">',
      '<div class="campus-attendance-session-head"><div><h4>', escapeHtml(row.title || "Class session"),
      '</h4><p>', escapeHtml(dateText(row.created_at)), ' · ', escapeHtml(row.session_date || ""), '</p></div>',
      '<span class="campus-attendance-state ', closed ? "is-closed" : "is-open", '">', closed ? "Closed" : "Open", '</span></div>',
      '<div class="campus-attendance-counts"><span><strong>', Number(row.checked_in_count || 0),
      '</strong> checked in</span><span><strong>', Number(row.present_count || 0),
      '</strong> present</span><span><strong>', Number(row.late_count || 0), '</strong> late</span></div>',
      '<p class="campus-attendance-session-expiry">Check-in window ends ', escapeHtml(dateText(row.attendance_window_ends_at)), '</p>',
      '<div class="campus-attendance-actions">',
      '<button class="btn" type="button" data-attendance-issue="', id, '" ', closed ? "disabled" : "", '>Show / refresh QR</button>',
      '<button class="btn secondary" type="button" data-attendance-roster="', id, '">View roster</button>',
      '<button class="btn secondary" type="button" data-attendance-close="', id, '" ', closed ? "disabled" : "", '>Close check-in</button>',
      '</div>',
      '<div class="campus-attendance-qr" data-attendance-qr-display hidden><div class="campus-attendance-qr-image-wrap"><img data-attendance-qr-image alt="Short-lived CampusShield class attendance QR code"></div>',
      '<div><strong>Ask enrolled students to scan this code now.</strong>',
      '<p class="muted">This code rotates automatically and expires within 45 seconds. Do not post it publicly.</p>',
      '<p class="campus-attendance-countdown" data-attendance-qr-countdown></p>',
      '<div class="actions"><button class="btn secondary" type="button" data-attendance-copy>Copy secure fallback code</button>',
      '<button class="btn secondary" type="button" data-attendance-hide-qr>Hide QR</button></div></div></div>',
      '<p class="message" data-attendance-qr-status role="status" aria-live="polite"></p>',
      '<div class="campus-attendance-roster" data-attendance-roster-panel hidden><p class="message" data-attendance-roster-status role="status" aria-live="polite"></p><div data-attendance-roster-list></div></div>',
      '</article>'
    ].join("");
  }

  async function loadSessions() {
    const feed = one("[data-attendance-sessions]", root);
    const status = one("[data-attendance-manager-status]", root);
    if (!feed || !classroomId) return;
    setMessage(status, "Loading attendance sessions…", false);
    feed.innerHTML = '<div class="community-empty">Loading sessions…</div>';
    try {
      const rows = await callRpc("list_campus_class_attendance_sessions", { p_classroom_id: classroomId });
      if (!root || !root.isConnected) return;
      feed.innerHTML = Array.isArray(rows) && rows.length
        ? rows.map(renderSession).join("")
        : '<div class="community-empty">No attendance sessions yet. Create one when class begins.</div>';
      setMessage(status, rows && rows.length ? rows.length + " attendance session(s)." : "Ready to create your first session.", false);
    } catch (error) {
      feed.innerHTML = '<div class="community-empty">Attendance sessions are temporarily unavailable.</div>';
      setMessage(status, error.message || "Could not load attendance sessions.", true);
    }
  }

  function renderRosterRow(sessionId, row) {
    const studentId = escapeHtml(row.student_id);
    const status = ["present", "late", "absent"].includes(row.status) ? row.status : "";
    const method = row.attendance_method === "qr" ? "QR scan" : row.attendance_method === "manual" ? "Manual" : "Not recorded";
    return [
      '<div class="campus-attendance-roster-row"><div class="campus-attendance-student"><strong>',
      escapeHtml(row.display_name || "Student"), '</strong><small>',
      status ? escapeHtml(status.toUpperCase() + " · " + method) : "Not checked in",
      row.marked_at ? " · " + escapeHtml(dateText(row.marked_at)) : "",
      '</small></div><div class="campus-attendance-roster-edit"><select aria-label="Attendance status for ',
      escapeHtml(row.display_name || "student"), '" data-attendance-status="', studentId, '">',
      '<option value="" ', status ? "" : "selected", '>Choose status</option>',
      '<option value="present" ', status === "present" ? "selected" : "", '>Present</option>',
      '<option value="late" ', status === "late" ? "selected" : "", '>Late</option>',
      '<option value="absent" ', status === "absent" ? "selected" : "", '>Absent</option>',
      '</select><button class="btn secondary" type="button" data-attendance-mark="', studentId,
      '" data-attendance-session="', escapeHtml(sessionId), '">Save</button></div></div>'
    ].join("");
  }

  async function showRoster(sessionId, card) {
    const panel = one("[data-attendance-roster-panel]", card);
    const status = one("[data-attendance-roster-status]", card);
    const list = one("[data-attendance-roster-list]", card);
    panel.hidden = false;
    list.innerHTML = '<div class="community-empty">Loading enrolled students…</div>';
    setMessage(status, "Loading roster…", false);
    try {
      const rows = await callRpc("list_campus_class_attendance_roster", { p_session_id: sessionId });
      list.innerHTML = Array.isArray(rows) && rows.length
        ? rows.map(row => renderRosterRow(sessionId, row)).join("")
        : '<div class="community-empty">No enrolled students were found for this class.</div>';
      setMessage(status, rows.length + " enrolled student(s). Review QR check-ins and correct records when necessary.", false);
    } catch (error) {
      list.innerHTML = '<div class="community-empty">The private roster could not be loaded.</div>';
      setMessage(status, error.message || "Could not load the attendance roster.", true);
    }
  }

  function managerMarkup() {
    return [
      '<div class="campus-attendance-heading"><div><span class="campus-attendance-eyebrow">CLASS ATTENDANCE</span>',
      '<h3>QR attendance register</h3><p>Start a session, display a rotating QR code and review the enrolled-student roster.</p></div>',
      '<span class="campus-attendance-trust-tag">Verified class access</span></div>',
      '<div class="campus-attendance-notice">A QR scan records a timestamped check-in as present or late. It does not prove physical presence or prevent a code being shared. Review the roster and correct records when necessary; changes are audited.</div>',
      '<form class="campus-attendance-create-form" data-attendance-create-form>',
      '<div class="field"><label for="campus-attendance-session-title">Session title *</label>',
      '<input id="campus-attendance-session-title" required minlength="2" maxlength="160" placeholder="e.g. CSC 301 — Monday lecture"></div>',
      '<button class="btn" type="submit" data-attendance-create>Start attendance session for today</button></form>',
      '<p class="message" data-attendance-manager-status role="status" aria-live="polite">Loading attendance sessions…</p>',
      '<div class="campus-attendance-sessions" data-attendance-sessions></div>'
    ].join("");
  }

  function studentMarkup() {
    return [
      '<div class="campus-attendance-heading"><div><span class="campus-attendance-eyebrow">CLASS ATTENDANCE</span>',
      '<h3>Check in to this class</h3><p>Scan the current QR code shown by your lecturer.</p></div>',
      '<span class="campus-attendance-trust-tag">Verified enrolment required</span></div>',
      '<div class="campus-attendance-notice">A successful scan records a present or late check-in. It is a check-in record, not proof of physical presence. Do not forward or share a lecturer’s short-lived QR code.</div>',
      '<div class="campus-attendance-scanner"><video data-attendance-camera-video playsinline muted hidden></video>',
      '<div class="campus-attendance-actions"><button class="btn" type="button" data-attendance-start-camera>Open camera to scan QR</button>',
      '<button class="btn secondary" type="button" data-attendance-stop-camera hidden>Stop camera</button></div>',
      '<p class="message" data-attendance-camera-status role="status" aria-live="polite">Camera scanning is available on supported HTTPS browsers. You can also paste the code below.</p></div>',
      '<form data-attendance-checkin-form class="campus-attendance-checkin-form"><div class="field">',
      '<label for="campus-attendance-qr-text">Paste secure QR text (camera alternative)</label>',
      '<textarea id="campus-attendance-qr-text" required maxlength="1200" rows="3" placeholder="Paste the complete CampusShield QR text shared by your lecturer."></textarea></div>',
      '<button class="btn" type="submit" data-attendance-submit>Submit check-in</button></form>',
      '<p class="message" data-attendance-student-status role="status" aria-live="polite"></p>'
    ].join("");
  }

  async function submitCheckin(raw) {
    const status = one("[data-attendance-student-status]", root);
    const button = one("[data-attendance-submit]", root);
    let payload;
    try { payload = parseQr(raw); }
    catch (error) { setMessage(status, error.message, true); throw error; }
    button.disabled = true;
    setMessage(status, "Checking your verified enrolment and QR expiry…", false);
    try {
      const row = firstRow(await callRpc("check_in_campus_class_attendance", {
        p_session_id: payload.sessionId,
        p_qr_token: payload.token
      }));
      if (!row || !row.attendance_id || !["present", "late"].includes(row.status)) {
        throw new Error("The attendance service did not confirm this check-in. Ask your lecturer to refresh the QR code.");
      }
      const message = row.already_recorded
        ? "You have already checked in to " + (row.session_title || "this session") + ". Your recorded status is " + row.status + "."
        : "Check-in recorded for " + (row.session_title || "this session") + " as " + row.status + ".";
      setMessage(status, message, false);
      const input = one("#campus-attendance-qr-text", root);
      if (input) input.value = "";
      return row;
    } catch (error) {
      setMessage(status, error.message || "Could not record your check-in.", true);
      throw error;
    } finally {
      button.disabled = false;
    }
  }

  async function startCamera() {
    const status = one("[data-attendance-camera-status]", root);
    const start = one("[data-attendance-start-camera]", root);
    const stop = one("[data-attendance-stop-camera]", root);
    const video = one("[data-attendance-camera-video]", root);
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage(status, "Camera access requires HTTPS and a supported browser. Use the paste-code option below.", true);
      return;
    }
    if (typeof window.BarcodeDetector !== "function") {
      setMessage(status, "This browser does not support built-in QR scanning. Use the paste-code option below.", true);
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      cameraVideo = video;
      video.srcObject = cameraStream;
      video.hidden = false;
      await video.play();
      start.hidden = true;
      stop.hidden = false;
      setMessage(status, "Camera is active. Point it at your lecturer’s current QR code.", false);
      const scan = async () => {
        if (!cameraStream || !cameraVideo || cameraBusy) return;
        try {
          const codes = await detector.detect(cameraVideo);
          if (codes && codes.length && codes[0].rawValue) {
            cameraBusy = true;
            await submitCheckin(codes[0].rawValue).catch(() => {});
            stopCamera();
            setMessage(status, "Scan complete. You can close the camera.", false);
            return;
          }
        } catch {
          setMessage(status, "The QR could not be read. Hold the camera steady or paste the code below.", true);
        }
        if (cameraStream) cameraFrame = window.requestAnimationFrame(scan);
      };
      cameraFrame = window.requestAnimationFrame(scan);
    } catch (error) {
      stopCamera();
      const message = error && error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access or use the paste-code option."
        : "Camera scanning could not start. Use the paste-code option instead.";
      setMessage(status, message, true);
    }
  }

  async function handleClick(event) {
    const issue = event.target.closest("[data-attendance-issue]");
    if (issue) {
      const card = issue.closest("[data-attendance-card]");
      const sessionId = issue.dataset.attendanceIssue;
      if (qrSessionId && qrSessionId !== sessionId) hideQr();
      qrSessionId = sessionId;
      qrCard = card;
      one("[data-attendance-qr-display]", card).hidden = false;
      await issueQr(sessionId, card);
      return;
    }

    const hide = event.target.closest("[data-attendance-hide-qr]");
    if (hide) {
      if (hide.closest("[data-attendance-card]") === qrCard) hideQr();
      return;
    }

    const copy = event.target.closest("[data-attendance-copy]");
    if (copy) {
      const status = one("[data-attendance-qr-status]", copy.closest("[data-attendance-card]"));
      if (!qrPayload || !navigator.clipboard || !navigator.clipboard.writeText) {
        setMessage(status, "Copy is unavailable here. Ask students to scan the displayed QR code.", true);
        return;
      }
      try {
        await navigator.clipboard.writeText(qrPayload);
        setMessage(status, "Short-lived fallback code copied. Share it only with students in this class.", false);
      } catch {
        setMessage(status, "Clipboard access was blocked. Ask students to scan the displayed QR code.", true);
      }
      return;
    }

    const roster = event.target.closest("[data-attendance-roster]");
    if (roster) {
      await showRoster(roster.dataset.attendanceRoster, roster.closest("[data-attendance-card]"));
      return;
    }

    const close = event.target.closest("[data-attendance-close]");
    if (close) {
      if (!window.confirm("Close check-in for this session? Students will no longer be able to use its QR code.")) return;
      close.disabled = true;
      try {
        await callRpc("close_campus_class_attendance_session", { p_session_id: close.dataset.attendanceClose });
        if (qrSessionId === close.dataset.attendanceClose) hideQr();
        await loadSessions();
      } catch (error) {
        close.disabled = false;
        setMessage(one("[data-attendance-manager-status]", root), error.message || "Could not close this attendance session.", true);
      }
      return;
    }

    const mark = event.target.closest("[data-attendance-mark]");
    if (mark) {
      const card = mark.closest("[data-attendance-card]");
      const select = one('[data-attendance-status="' + CSS.escape(mark.dataset.attendanceMark) + '"]', card);
      const status = one("[data-attendance-roster-status]", card);
      if (!select || !select.value) {
        setMessage(status, "Choose Present, Late or Absent first.", true);
        return;
      }
      mark.disabled = true;
      try {
        await callRpc("mark_campus_class_attendance", {
          p_session_id: mark.dataset.attendanceSession,
          p_student_id: mark.dataset.attendanceMark,
          p_status: select.value
        });
        await showRoster(mark.dataset.attendanceSession, card);
        await loadSessions();
      } catch (error) {
        mark.disabled = false;
        setMessage(status, error.message || "Could not update this attendance record.", true);
      }
      return;
    }

    if (event.target.closest("[data-attendance-start-camera]")) await startCamera();
    if (event.target.closest("[data-attendance-stop-camera]")) {
      stopCamera();
      setMessage(one("[data-attendance-camera-status]", root), "Camera stopped.", false);
    }
  }

  async function handleSubmit(event) {
    if (event.target.matches("[data-attendance-create-form]")) {
      event.preventDefault();
      const title = one("#campus-attendance-session-title", root).value.trim();
      const button = one("[data-attendance-create]", root);
      const status = one("[data-attendance-manager-status]", root);
      if (title.length < 2 || title.length > 160) {
        setMessage(status, "Enter a session title between 2 and 160 characters.", true);
        return;
      }
      button.disabled = true;
      setMessage(status, "Creating today’s attendance session…", false);
      try {
        const sessionId = await callRpc("create_campus_class_session", {
          p_classroom_id: classroomId,
          p_title: title,
          p_session_date: localDate()
        });
        if (!sessionId) throw new Error("The attendance service did not return a session ID.");
        one("#campus-attendance-session-title", root).value = "";
        setMessage(status, "Attendance session created. Display a fresh QR code for enrolled students.", false);
        await loadSessions();
      } catch (error) {
        setMessage(status, error.message || "Could not create this attendance session.", true);
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (event.target.matches("[data-attendance-checkin-form]")) {
      event.preventDefault();
      const input = one("#campus-attendance-qr-text", root);
      const raw = input.value.trim();
      if (!raw) {
        setMessage(one("[data-attendance-student-status]", root), "Scan a QR code or paste the secure QR text first.", true);
        return;
      }
      await submitCheckin(raw).catch(() => {});
    }
  }

  async function mount(id, role) {
    teardown();
    const target = document.querySelector("[data-campus-attendance]");
    if (!target || !id) return;
    root = target;
    classroomId = String(id);
    const thisGeneration = generation;
    root.innerHTML = '<div class="community-empty">Checking classroom attendance access…</div>';
    try {
      const capabilities = firstRow(await callRpc("get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }));
      if (thisGeneration !== generation || !root || !root.isConnected) return;
      if (!capabilities || !capabilities.can_access) {
        root.innerHTML = '<div class="community-empty">Attendance is not available for this classroom.</div>';
        return;
      }
      if (capabilities.can_manage) {
        root.innerHTML = managerMarkup();
        void loadSessions();
      } else if (String(role || "") === "student") {
        root.innerHTML = studentMarkup();
      } else {
        root.innerHTML = '<div class="community-empty">Attendance is limited to enrolled students and appointed class staff.</div>';
      }
      root.addEventListener("click", handleClick);
      root.addEventListener("submit", handleSubmit);
    } catch (error) {
      if (thisGeneration !== generation) return;
      root.innerHTML = '<div class="community-empty">Class attendance could not be loaded. Refresh the classroom to try again.</div>';
      console.warn("Campus attendance access check failed:", error && error.message || "Unknown error");
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopCamera();
      stopQrTimers();
      if (qrCard) {
        const image = one("[data-attendance-qr-image]", qrCard);
        if (image) image.removeAttribute("src");
        qrPayload = "";
        qrExpiry = 0;
        setMessage(one("[data-attendance-qr-status]", qrCard), "QR hidden while this tab is in the background.", false);
      }
    } else if (qrSessionId && qrCard && qrCard.isConnected) {
      void issueQr(qrSessionId, qrCard);
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-page]")) stopCamera();
  }, true);
  window.addEventListener("pagehide", () => {
    stopCamera();
    hideQr();
  });
  window.addEventListener("campusshield:profile-cleared", teardown);

  window.CampusShieldAttendance = { mount: mount, teardown: teardown };
})();