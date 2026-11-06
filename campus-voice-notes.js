(() => {
  "use strict";

  const BUCKET = "campus-chat-voice-notes";
  const PREFIX = "CAMPUSSHIELD_VOICE_V1:";
  const MAX_SECONDS = 90;
  const MAX_BYTES = 8 * 1024 * 1024;
  const pending = new Map();
  const recording = new Map();
  const objectUrls = new Map();
  const $ = (selector, root = document) => root.querySelector(selector);

  function setStatus(config, message, error) {
    if (!config.status) return;
    config.status.textContent = message || "";
    config.status.dataset.state = error ? "error" : "ready";
  }

  function cleanupPreview(key) {
    const item = pending.get(key);
    if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    pending.delete(key);
    const config = configs.find((entry) => entry.key === key);
    if (config && config.preview) {
      config.preview.pause();
      config.preview.removeAttribute("src");
      config.preview.load();
      config.preview.hidden = true;
    }
    if (config && config.discard) config.discard.hidden = true;
    updateComposer(key);
  }

  function stopTracks(stream) {
    if (stream) stream.getTracks().forEach((track) => track.stop());
  }

  function updateComposer(key) {
    const config = configs.find((entry) => entry.key === key);
    if (!config) return;
    const active = recording.has(key);
    const inputReady = !!config.input && !config.input.disabled;
    if (config.record) {
      config.record.disabled = !inputReady && !active;
      config.record.textContent = active ? "Stop recording" : (pending.has(key) ? "Record again" : "Record voice note");
      config.record.setAttribute("aria-pressed", String(active));
    }
    if (config.discard) {
      config.discard.hidden = !pending.has(key);
      config.discard.disabled = !inputReady;
    }
  }

  const configs = [
    {
      key: "campus",
      form: $("#campus-chat-form"),
      input: $("#campus-chat-input"),
      record: $("#campus-chat-voice-record"),
      discard: $("#campus-chat-voice-discard"),
      preview: $("#campus-chat-voice-preview"),
      status: $("#campus-chat-voice-status"),
      threadStatus: $("#campus-chat-status")
    },
    {
      key: "direct",
      form: $("#campus-dm-compose-form"),
      input: $("#campus-dm-compose-input"),
      record: $("#campus-dm-voice-record"),
      discard: $("#campus-dm-voice-discard"),
      preview: $("#campus-dm-voice-preview"),
      status: $("#campus-dm-voice-status"),
      threadStatus: $("#campus-dm-thread-status")
    }
  ];

  function chooseMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function normaliseMime(value) {
    const base = String(value || "").toLowerCase().split(";")[0].trim();
    return ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"].includes(base) ? base : "";
  }

  function extensionFor(mime) {
    return ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" })[mime] || "";
  }

  function resetRecordingUi(key) {
    const config = configs.find((entry) => entry.key === key);
    if (!config) return;
    updateComposer(key);
  }

  async function beginRecording(key) {
    const config = configs.find((entry) => entry.key === key);
    if (!config || !config.input || config.input.disabled) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || !window.MediaRecorder) {
      setStatus(config, "Voice recording is not supported in this browser. Use the text message instead.", true);
      return;
    }
    if (pending.has(key)) cleanupPreview(key);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const entry = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, timer: null };
      recording.set(key, entry);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) entry.chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        clearTimeout(entry.timer);
        stopTracks(stream);
        recording.delete(key);
        resetRecordingUi(key);
        if (entry.cancelled) {
          setStatus(config, "Recording discarded.");
          return;
        }
        const type = normaliseMime(recorder.mimeType || mimeType || (entry.chunks[0] && entry.chunks[0].type));
        const blob = new Blob(entry.chunks, { type: type || "audio/webm" });
        if (!type || !blob.size) {
          setStatus(config, "The browser did not produce a supported audio file. Try again or send text.", true);
          return;
        }
        if (blob.size > MAX_BYTES) {
          setStatus(config, "This recording exceeds the 8 MB limit. Please record a shorter note.", true);
          return;
        }
        const duration = Math.max(1, Math.min(MAX_SECONDS, Math.round((Date.now() - entry.startedAt) / 1000)));
        const previewUrl = URL.createObjectURL(blob);
        pending.set(key, { blob, mime: type, duration, previewUrl });
        if (config.preview) {
          config.preview.src = previewUrl;
          config.preview.hidden = false;
          config.preview.load();
        }
        if (config.discard) config.discard.hidden = false;
        setStatus(config, "Voice note ready · " + duration + " seconds. Listen before sending.");
        updateComposer(key);
      }, { once: true });
      recorder.start(250);
      setStatus(config, "Recording… Stop when you are finished. Maximum 90 seconds.");
      updateComposer(key);
      entry.timer = setTimeout(() => {
        if (recording.get(key) === entry && recorder.state !== "inactive") {
          setStatus(config, "90-second limit reached. Preparing your voice note…");
          recorder.stop();
        }
      }, MAX_SECONDS * 1000);
    } catch (error) {
      stopTracks(stream);
      recording.delete(key);
      resetRecordingUi(key);
      setStatus(config, error && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in your browser settings to record."
        : (error && error.message) || "Could not start the microphone.", true);
    }
  }

  function endRecording(key, discard) {
    const entry = recording.get(key);
    if (!entry) return;
    entry.cancelled = !!discard;
    clearTimeout(entry.timer);
    if (entry.recorder.state !== "inactive") entry.recorder.stop();
  }

  function parseVoiceBody(body) {
    const raw = String(body || "");
    if (!raw.startsWith(PREFIX)) return null;
    try {
      const payload = JSON.parse(raw.slice(PREFIX.length));
      const validPath = /^(campus|direct)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3|wav)$/i.test(String(payload.path || ""));
      const mime = normaliseMime(payload.mime);
      const duration = Number(payload.duration);
      if (payload.version !== 1 || !validPath || !mime || !Number.isFinite(duration) || duration < 1 || duration > MAX_SECONDS) return null;
      return { path: payload.path, mime, duration, text: String(payload.text || "").slice(0, 500) };
    } catch (_error) {
      return null;
    }
  }

  async function loadAudio(player, payload) {
    const api = window.CampusShieldBackend;
    if (!api || !api.client || !player.isConnected) return;
    const { data, error } = await api.client.storage.from(BUCKET).download(payload.path);
    if (error) throw error;
    if (!player.isConnected) return;
    const url = URL.createObjectURL(data);
    objectUrls.set(player, url);
    player.src = url;
    player.load();
  }

  function decorateVoiceMessage(body) {
    if (!body || body.dataset.voiceRendered === "true") return;
    const payload = parseVoiceBody(body.textContent.trim());
    if (!payload) return;
    const card = body.closest(".campus-chat-message, .campus-dm-message");
    if (!card || card.classList.contains("is-hidden") || card.dataset.status === "hidden") return;
    if (card.dataset.status && card.dataset.status !== "published") return;
    body.dataset.voiceRendered = "true";
    body.textContent = payload.text || "Voice note";
    const player = document.createElement("audio");
    player.className = "campus-voice-player";
    player.controls = true;
    player.preload = "none";
    player.setAttribute("aria-label", "Voice note, " + payload.duration + " seconds");
    const detail = document.createElement("span");
    detail.className = "campus-voice-duration";
    detail.textContent = "Voice note · " + payload.duration + " sec";
    body.insertAdjacentElement("afterend", detail);
    detail.insertAdjacentElement("afterend", player);
    loadAudio(player, payload).catch(() => {
      if (!player.isConnected) return;
      const unavailable = document.createElement("span");
      unavailable.className = "campus-voice-unavailable";
      unavailable.textContent = "Voice note unavailable (access may have changed).";
      player.replaceWith(unavailable);
    });
  }

  function decorateLabels(root) {
    root.querySelectorAll(".campus-dm-conversation-copy small, .campus-dm-report-card blockquote, .campus-chat-report-card p").forEach((node) => {
      if (node.dataset.voiceLabel === "true") return;
      if (!String(node.textContent || "").trim().startsWith(PREFIX)) return;
      node.dataset.voiceLabel = "true";
      node.textContent = "Voice note attachment · privately stored";
    });
  }

  function decorateMessages(root) {
    root.querySelectorAll(".campus-chat-message-body, .campus-dm-message-body").forEach(decorateVoiceMessage);
    decorateLabels(root);
    for (const [player, url] of objectUrls.entries()) {
      if (!player.isConnected) {
        URL.revokeObjectURL(url);
        objectUrls.delete(player);
      }
    }
  }

  async function submitVoice(key, event) {
    const config = configs.find((entry) => entry.key === key);
    const audio = pending.get(key);
    if (!config || !audio) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (config.form.dataset.voiceSending === "true") return;
    const caption = String(config.input.value || "").trim();
    if (caption.length > 500) {
      setStatus(config, "A voice-note caption can contain up to 500 characters.", true);
      return;
    }
    const status = config.threadStatus || config.status;
    if (config.input.disabled) {
      setStatus(config, "This composer is not currently available.", true);
      return;
    }
    const send = config.key === "campus" ? $("#campus-chat-send") : $("#campus-dm-compose-send");
    const thread = $("#campus-dm-thread-messages");
    const conversationId = config.key === "direct" ? String(thread && thread.dataset.conversationId || "") : "";
    if (config.key === "direct" && !conversationId) {
      setStatus(config, "Open an accepted private conversation before sending a voice note.", true);
      return;
    }
    config.form.dataset.voiceSending = "true";
    if (send) send.disabled = true;
    setStatus(config, "Uploading your private voice note…");
    let uploadedPath = "";
    try {
      const api = window.CampusShieldBackend;
      if (!api || !api.isConfigured || !api.client) throw new Error("CampusShield is not connected to Supabase.");
      const user = await api.getCurrentUser();
      if (!user) throw new Error("Sign in before sending a voice note.");
      const campus = await api.getMyCampusContext();
      if (!campus || !campus.university_id) throw new Error("Choose your verified university first.");
      const ext = extensionFor(audio.mime);
      if (!ext) throw new Error("This audio format is not supported.");
      const parent = config.key === "campus" ? campus.university_id : conversationId;
      const folder = config.key === "campus" ? "campus" : "direct";
      const fileName = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("")) + "." + ext;
      uploadedPath = folder + "/" + parent + "/" + user.id + "/" + fileName;
      const { error: uploadError } = await api.client.storage.from(BUCKET).upload(uploadedPath, audio.blob, {
        contentType: audio.mime,
        cacheControl: "3600",
        upsert: false
      });
      if (uploadError) throw uploadError;
      const marker = PREFIX + JSON.stringify({
        version: 1,
        path: uploadedPath,
        mime: audio.mime,
        duration: audio.duration,
        text: caption
      });
      if (marker.length > 1200) throw new Error("The voice-note message is too large. Shorten the caption and try again.");
      if (config.key === "campus") {
        const activeTab = $("[data-chat-channel].active");
        const channel = activeTab && activeTab.dataset.chatChannel || "general";
        await api.sendCampusChatMessage(channel, marker);
      } else {
        await api.sendCampusDirectMessage(conversationId, marker);
      }
      config.input.value = "";
      cleanupPreview(key);
      setStatus(config, "Voice note sent.");
      if (config.key === "campus") {
        const activeTab = $("[data-chat-channel].active");
        if (activeTab) activeTab.click();
      } else {
        const activeConversation = $(".campus-dm-conversation.active");
        if (activeConversation) activeConversation.click();
      }
    } catch (error) {
      if (uploadedPath && window.CampusShieldBackend && window.CampusShieldBackend.client) {
        try { await window.CampusShieldBackend.client.storage.from(BUCKET).remove([uploadedPath]); } catch (_cleanupError) {}
      }
      setStatus(config, (error && error.message) || "Could not send the voice note.", true);
    } finally {
      config.form.dataset.voiceSending = "false";
      if (send) send.disabled = !!config.input.disabled;
    }
  }

  function mountComposer(config) {
    if (!config.form || !config.record || !config.input) return;
    config.record.addEventListener("click", () => {
      if (recording.has(config.key)) {
        endRecording(config.key, false);
        return;
      }
      beginRecording(config.key);
    });
    config.discard?.addEventListener("click", () => {
      if (recording.has(config.key)) endRecording(config.key, true);
      cleanupPreview(config.key);
      setStatus(config, "Recording discarded.");
    });
    config.form.addEventListener("submit", (event) => {
      if (pending.has(config.key)) submitVoice(config.key, event);
    }, true);
    const observer = new MutationObserver(() => updateComposer(config.key));
    observer.observe(config.input, { attributes: true, attributeFilter: ["disabled"] });
    updateComposer(config.key);
  }

  function init() {
    configs.forEach(mountComposer);
    const observer = new MutationObserver(() => decorateMessages(document));
    observer.observe(document.body, { childList: true, subtree: true });
    decorateMessages(document);
    document.addEventListener("campusshield:session-changed", () => {
      configs.forEach((config) => {
        if (recording.has(config.key)) endRecording(config.key, true);
        cleanupPreview(config.key);
      });
    });
    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-ideas-impact-nav]");
      if (nav) {
        window.setTimeout(() => {
          const section = $("#campus-ideas-impact");
          if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
            $("#cii-title")?.setAttribute("tabindex", "-1");
            $("#cii-title")?.focus({ preventScroll: true });
          }
        }, 240);
      }
      if (event.target.closest("[data-page]") && !event.target.closest("[data-ideas-impact-nav]")) {
        configs.forEach((config) => {
          if (recording.has(config.key)) endRecording(config.key, true);
        });
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();