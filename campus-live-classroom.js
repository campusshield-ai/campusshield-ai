(() => {
  "use strict";

  const root = document.getElementById("campus-live-classroom-root");
  const page = document.getElementById("page-classroom");
  if (!root || !page) return;

  const backend = () => window.CampusShieldBackend;
  let classrooms = [];
  let selectedClassroomId = "";
  let sessions = [];
  let canManage = false;
  let room = null;
  let activeSessionId = null;
  let loading = false;
  let refreshSequence = 0;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  function formatDate(value) {
    if (!value) return "Time not set";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Time not set"
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium", timeStyle: "short"
        }).format(date);
  }

  function safeHttps(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function setMessage(message, isError = false) {
    const el = root.querySelector("[data-live-status]");
    if (el) {
      el.textContent = message;
      el.dataset.kind = isError ? "error" : "info";
    }
  }

  function renderLoading(message = "Loading your campus classes…") {
    root.innerHTML = '<div class="cs-live-empty">' + escapeHtml(message) + '</div>';
  }

  function renderEmpty(message) {
    root.innerHTML = '<div class="cs-live-empty">' + escapeHtml(message) + '</div>';
  }

  function render() {
    if (!classrooms.length) {
      renderEmpty("No classrooms are available yet. Join a class with a teacher's code, or ask a verified lecturer to create one.");
      return;
    }

    const selected = classrooms.find(item => item.id === selectedClassroomId) || classrooms[0];
    const options = classrooms.map(item =>
      '<option value="' + escapeHtml(item.id) + '"' +
      (item.id === selectedClassroomId ? " selected" : "") + '>' +
      escapeHtml(item.subject + " — " + item.name) + '</option>'
    ).join("");

    const sessionCards = sessions.length ? sessions.map(item => {
      const external = safeHttps(item.external_meeting_url);
      const recording = safeHttps(item.recording_url);
      const canStart = canManage && item.status === "scheduled";
      const canEnd = canManage && item.status === "live";
      const canJoin = item.status === "live";
      const canRecord = canManage && item.status === "ended";
      const status = item.status === "live" ? "Live now" :
        item.status === "scheduled" ? "Scheduled" :
        item.status === "ended" ? "Ended" : "Cancelled";
      return '<article class="cs-live-session-card">' +
        '<div class="cs-live-session-head"><div><span class="cs-live-status cs-live-status-' + escapeHtml(item.status) + '">' + status + '</span>' +
        '<h3>' + escapeHtml(item.title) + '</h3></div>' +
        '<span class="cs-live-duration">' + Number(item.duration_minutes || 60) + ' min</span></div>' +
        (item.description ? '<p class="cs-live-description">' + escapeHtml(item.description) + '</p>' : '') +
        '<p class="cs-live-time"><strong>' + (item.status === "live" ? "Started" : "Scheduled") + ':</strong> ' + escapeHtml(formatDate(item.started_at || item.scheduled_at)) + '</p>' +
        (item.status === "ended" && item.ended_at ? '<p class="cs-live-time"><strong>Ended:</strong> ' + escapeHtml(formatDate(item.ended_at)) + '</p>' : '') +
        (external ? '<p><a class="cs-live-link" href="' + escapeHtml(external) + '" target="_blank" rel="noopener noreferrer">Open external meeting fallback ↗</a></p>' : '') +
        (recording ? '<p><a class="cs-live-link" href="' + escapeHtml(recording) + '" target="_blank" rel="noopener noreferrer">Watch recorded lecture ↗</a></p>' : '') +
        '<div class="cs-live-actions">' +
        (canStart ? '<button class="btn" type="button" data-live-action="start" data-session-id="' + escapeHtml(item.id) + '">Start class</button>' : '') +
        (canJoin ? '<button class="btn" type="button" data-live-action="join" data-session-id="' + escapeHtml(item.id) + '">Join live class</button>' : '') +
        (canEnd ? '<button class="btn danger" type="button" data-live-action="end" data-session-id="' + escapeHtml(item.id) + '">End class</button>' : '') +
        (canRecord && !recording ? '<button class="btn secondary" type="button" data-live-action="add-recording" data-session-id="' + escapeHtml(item.id) + '">Add recording link</button>' : '') +
        '</div>' +
        (canRecord && !recording ? '<form class="cs-live-recording-form" data-live-recording-form="' + escapeHtml(item.id) + '">' +
          '<label>Recorded lecture HTTPS link<input name="recording_url" type="url" placeholder="https://…" required></label>' +
          '<button class="btn secondary" type="submit">Save recording</button></form>' : '') +
        '</article>';
    }).join("") : '<div class="cs-live-empty">No live classes have been scheduled for this classroom yet.</div>';

    root.innerHTML =
      '<div class="cs-live-toolbar"><label for="cs-live-classroom-select">Choose classroom</label>' +
      '<select id="cs-live-classroom-select" data-live-classroom-select>' + options + '</select></div>' +
      (canManage ? '<section class="cs-live-create-card"><div class="cs-live-section-title"><div><h3>Schedule an online class</h3><p>Create a live room for this classroom. Students can join when you start it.</p></div><span class="cs-live-icon">◉</span></div>' +
        '<form id="cs-live-create-form">' +
        '<div class="cs-live-form-grid"><label>Class title *<input name="title" required minlength="3" maxlength="160" placeholder="e.g. CSC 201 — Week 4 lecture"></label>' +
        '<label>Start date &amp; time *<input name="scheduled_at" type="datetime-local" required></label>' +
        '<label>Duration<select name="duration_minutes"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60" selected>1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></label>' +
        '<label>External meeting fallback (optional)<input name="external_meeting_url" type="url" placeholder="https://meet.example.com/…"></label></div>' +
        '<label class="cs-live-full-field">Description (optional)<textarea name="description" maxlength="2000" rows="2" placeholder="Topics, preparation or instructions for students"></textarea></label>' +
        '<div class="cs-live-actions"><button class="btn" type="submit">Schedule class</button></div></form></section>' : '') +
      '<section class="cs-live-list-section"><div class="cs-live-section-title"><div><h3>Online class schedule</h3><p>Live sessions are visible only to verified members of this classroom.</p></div><button class="btn secondary" type="button" data-live-action="refresh">Refresh</button></div>' +
      '<div class="cs-live-session-list">' + sessionCards + '</div></section>' +
      '<p class="cs-live-status-message" data-live-status role="status" aria-live="polite"></p>' +
      '<section class="cs-live-room" id="cs-live-room-panel" hidden>' +
        '<div class="cs-live-room-heading"><div><span class="cs-live-room-kicker">CAMPUSSHIELD LIVE</span><h3 id="cs-live-room-title">Live classroom</h3></div><button class="btn secondary" type="button" data-live-action="leave">Leave room</button></div>' +
        '<div class="cs-live-media-grid" id="cs-live-media-grid"><div class="cs-live-empty">Connecting to the classroom…</div></div>' +
        '<div class="cs-live-room-controls"><button class="btn secondary" type="button" data-live-action="mic">Mute microphone</button><button class="btn secondary" type="button" data-live-action="camera">Turn camera on</button><button class="btn secondary" type="button" data-live-action="screen">Share screen</button><button class="btn secondary" type="button" data-live-action="audio">Enable audio</button></div>' +
        '<p class="cs-live-room-footnote">Use headphones where possible. Your browser may ask for microphone, camera or screen-sharing permission.</p>' +
      '</section>';

    const dateField = root.querySelector('input[name="scheduled_at"]');
    if (dateField) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateField.min = now.toISOString().slice(0, 16);
    }
  }

  async function loadSelectedClassroom(sequence) {
    const selected = classrooms.find(item => item.id === selectedClassroomId);
    if (!selected) return render();
    const [rows, capability] = await Promise.all([
      backend().listCampusLiveClassSessions(selectedClassroomId),
      backend().getCampusLiveClassroomCapabilities(selectedClassroomId)
    ]);
    if (sequence !== refreshSequence) return;
    sessions = Array.isArray(rows) ? rows : [];
    canManage = capability === true;
    render();
  }

  async function refresh() {
    if (loading) return;
    if (!backend()?.isConfigured) {
      return renderEmpty("CampusShield's learning service is not configured in this browser.");
    }
    loading = true;
    const sequence = ++refreshSequence;
    renderLoading();
    try {
      const rows = await backend().listCampusClassrooms();
      if (sequence !== refreshSequence) return;
      classrooms = Array.isArray(rows) ? rows : [];
      if (!classrooms.some(item => item.id === selectedClassroomId)) {
        selectedClassroomId = classrooms[0]?.id || "";
      }
      if (!classrooms.length) {
        sessions = [];
        canManage = false;
        render();
      } else {
        await loadSelectedClassroom(sequence);
      }
    } catch (error) {
      if (sequence === refreshSequence) renderEmpty(error?.message || "Could not load your classrooms.");
    } finally {
      loading = false;
    }
  }

  async function loadLivekitSdk() {
    if (window.LivekitClient?.Room) return window.LivekitClient;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/dist/livekit-client.umd.min.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("The live video library could not be loaded. Check your internet connection and try again."));
      document.head.appendChild(script);
    });
    if (!window.LivekitClient?.Room) throw new Error("The live video library did not initialize correctly.");
    return window.LivekitClient;
  }

  function addParticipantTile(identity, label, isLocal = false) {
    const grid = root.querySelector("#cs-live-media-grid");
    if (!grid) return null;
    const key = String(identity || "participant").replace(/[^a-zA-Z0-9_-]/g, "-");
    let tile = grid.querySelector('[data-live-participant="' + key + '"]');
    if (tile) return tile;
    tile = document.createElement("article");
    tile.className = "cs-live-participant" + (isLocal ? " is-local" : "");
    tile.dataset.liveParticipant = key;
    const title = document.createElement("strong");
    title.textContent = label || (isLocal ? "You" : "Participant");
    const media = document.createElement("div");
    media.className = "cs-live-participant-media";
    tile.append(title, media);
    grid.querySelector(".cs-live-empty")?.remove();
    grid.appendChild(tile);
    return tile;
  }

  function attachTrack(track, identity, label, isLocal = false) {
    const tile = addParticipantTile(identity, label, isLocal);
    if (!tile) return;
    const media = tile.querySelector(".cs-live-participant-media");
    const element = track.attach();
    element.autoplay = true;
    if (track.kind === "video") {
      element.playsInline = true;
      element.classList.add("cs-live-video");
    } else {
      element.classList.add("cs-live-audio");
    }
    media.appendChild(element);
  }

  async function joinLiveClass(sessionId) {
    const session = sessions.find(item => item.id === sessionId);
    if (!session || session.status !== "live") throw new Error("This class is not live right now.");
    await leaveLiveRoom();
    setMessage("Preparing your secure live-class connection…");
    const access = await backend().requestCampusLiveClassToken(sessionId);
    if (!access?.token || !access?.serverUrl) throw new Error("The live video service did not return a valid room connection.");
    const sdk = await loadLivekitSdk();
    const roomEvents = sdk.RoomEvent;
    room = new sdk.Room({ adaptiveStream: true, dynacast: true });
    activeSessionId = sessionId;
    const roomPanel = root.querySelector("#cs-live-room-panel");
    roomPanel.hidden = false;
    root.querySelector("#cs-live-room-title").textContent =
      (access.room?.classroomTitle || "Classroom") + " · " + (access.room?.title || session.title);
    const mediaGrid = root.querySelector("#cs-live-media-grid");
    mediaGrid.innerHTML = '<div class="cs-live-empty">Connecting to the classroom…</div>';

    room.on(roomEvents.TrackSubscribed, (track, _publication, participant) => {
      attachTrack(track, participant.identity, participant.name || "Class participant");
    });
    room.on(roomEvents.TrackUnsubscribed, track => {
      track.detach().forEach(element => element.remove());
    });
    room.on(roomEvents.ParticipantDisconnected, participant => {
      const key = String(participant.identity || "").replace(/[^a-zA-Z0-9_-]/g, "-");
      root.querySelector('[data-live-participant="' + key + '"]')?.remove();
    });
    room.on(roomEvents.Disconnected, () => {
      if (activeSessionId === sessionId) {
        activeSessionId = null;
        room = null;
      }
    });

    await room.connect(access.serverUrl, access.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.localParticipant.setCameraEnabled(false);
    addParticipantTile("local-" + Date.now(), "You · " + (access.room?.participantRole || "member"), true);
    for (const publication of room.localParticipant.videoTrackPublications.values()) {
      if (publication.track) attachTrack(publication.track, "local-" + Date.now(), "You", true);
    }
    if (room.canPlaybackAudio === false) {
      setMessage("Connected. Select Enable audio if your browser is waiting for a user gesture.");
    } else {
      setMessage("You are connected to the live classroom.");
    }
  }

  async function leaveLiveRoom() {
    const current = room;
    room = null;
    activeSessionId = null;
    if (current) {
      try { await current.disconnect(true); } catch (_) {}
    }
    const panel = root.querySelector("#cs-live-room-panel");
    if (panel) panel.hidden = true;
  }

  async function runAction(button) {
    const action = button.dataset.liveAction;
    const sessionId = button.dataset.sessionId;
    button.disabled = true;
    try {
      if (action === "refresh") return await refresh();
      if (action === "start") {
        await backend().startCampusLiveClassSession(sessionId);
        await refreshSelected();
        setMessage("Class started. Students can now join.");
      } else if (action === "end") {
        await backend().endCampusLiveClassSession(sessionId);
        if (activeSessionId === sessionId) await leaveLiveRoom();
        await refreshSelected();
        setMessage("The live class has ended.");
      } else if (action === "join") {
        try {
          await joinLiveClass(sessionId);
        } catch (error) {
          await leaveLiveRoom();
          const fallback = sessions.find(item => item.id === sessionId);
          if (safeHttps(fallback?.external_meeting_url)) {
            setMessage((error?.message || "Integrated video is not ready.") + " An external meeting link is available above.", true);
          } else {
            setMessage(error?.message || "Could not join the live class.", true);
          }
        }
      } else if (action === "leave") {
        await leaveLiveRoom();
        setMessage("You left the live classroom.");
      } else if (action === "mic" && room) {
        const enabled = room.localParticipant.isMicrophoneEnabled;
        await room.localParticipant.setMicrophoneEnabled(!enabled);
        button.textContent = enabled ? "Unmute microphone" : "Mute microphone";
      } else if (action === "camera" && room) {
        const enabled = room.localParticipant.isCameraEnabled;
        await room.localParticipant.setCameraEnabled(!enabled);
        button.textContent = enabled ? "Turn camera on" : "Turn camera off";
      } else if (action === "screen" && room) {
        const enabled = room.localParticipant.isScreenShareEnabled;
        await room.localParticipant.setScreenShareEnabled(!enabled);
        button.textContent = enabled ? "Share screen" : "Stop sharing screen";
      } else if (action === "audio" && room) {
        await room.startAudio();
        button.textContent = "Audio enabled";
        button.disabled = true;
      }
    } catch (error) {
      setMessage(error?.message || "That live-class action could not be completed.", true);
    } finally {
      if (button.isConnected && action !== "audio") button.disabled = false;
    }
  }

  async function refreshSelected() {
    if (!selectedClassroomId) return refresh();
    const sequence = ++refreshSequence;
    try {
      await loadSelectedClassroom(sequence);
    } catch (error) {
      setMessage(error?.message || "Could not refresh this class.", true);
    }
  }

  root.addEventListener("change", async event => {
    if (!event.target.matches("[data-live-classroom-select]")) return;
    selectedClassroomId = event.target.value;
    await leaveLiveRoom();
    renderLoading("Loading online classes…");
    await refreshSelected();
  });

  root.addEventListener("submit", async event => {
    const form = event.target;
    if (form.id === "cs-live-create-form") {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const values = new FormData(form);
        const scheduledValue = String(values.get("scheduled_at") || "");
        const scheduledAt = new Date(scheduledValue);
        if (!scheduledValue || Number.isNaN(scheduledAt.getTime())) throw new Error("Choose a valid class date and time.");
        const fallback = String(values.get("external_meeting_url") || "").trim();
        if (fallback && !safeHttps(fallback)) throw new Error("External meeting links must begin with https://.");
        await backend().createCampusLiveClassSession({
          classroomId: selectedClassroomId,
          title: String(values.get("title") || "").trim(),
          description: String(values.get("description") || "").trim(),
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: Number(values.get("duration_minutes") || 60),
          externalMeetingUrl: fallback || null
        });
        await refreshSelected();
        setMessage("Online class scheduled successfully.");
      } catch (error) {
        setMessage(error?.message || "Could not schedule this class.", true);
      } finally {
        if (submit?.isConnected) submit.disabled = false;
      }
      return;
    }

    const recordingSessionId = form.getAttribute("data-live-recording-form");
    if (recordingSessionId) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const url = String(new FormData(form).get("recording_url") || "").trim();
        if (!safeHttps(url)) throw new Error("Recording links must begin with https://.");
        await backend().setCampusLiveClassRecording(recordingSessionId, url);
        await refreshSelected();
        setMessage("Recorded lecture link saved for this classroom.");
      } catch (error) {
        setMessage(error?.message || "Could not save the recording link.", true);
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    }
  });

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-live-action]");
    if (button) runAction(button);
  });

  document.getElementById("campus-live-classroom-refresh")?.addEventListener("click", refresh);

  const observer = new MutationObserver(() => {
    if (page.classList.contains("active")) refresh();
    else if (room) leaveLiveRoom();
  });
  observer.observe(page, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && room) leaveLiveRoom();
  });
})();
