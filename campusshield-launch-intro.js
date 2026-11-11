/* CampusShield AI — first launch + rare repeat introduction. */
(() => {
  "use strict";

  const STORAGE_KEY = "campusshield.launchIntro.v1";
  const INTRO_VERSION = "1.0.0";
  const REPEAT_AFTER_MS = 45 * 24 * 60 * 60 * 1000;
  const MIN_UPDATE_GAP_MS = 30 * 24 * 60 * 60 * 1000;
  const NORMAL_DURATION_MS = 4800;
  const REDUCED_MOTION_DURATION_MS = 1200;
  const EXIT_DURATION_MS = 280;

  function isPasswordRecovery() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    return query.get("password-reset") === "1" || hash.get("type") === "recovery";
  }

  function readStorage() {
    try {
      const storage = window.localStorage;
      const raw = storage.getItem(STORAGE_KEY);
      return { available: true, record: raw ? JSON.parse(raw) : null };
    } catch (_error) {
      return { available: false, record: null };
    }
  }

  function shouldShow(record, now) {
    if (!record || !Number.isFinite(Number(record.completedAt))) return true;

    const completedAt = Number(record.completedAt);
    const elapsed = now - completedAt;
    if (elapsed < 0) return false;

    const currentMajor = INTRO_VERSION.split(".")[0];
    const previousMajor = String(record.version || "").split(".")[0];
    const majorUpdateDue = currentMajor !== previousMajor && elapsed >= MIN_UPDATE_GAP_MS;
    return majorUpdateDue || elapsed >= REPEAT_AFTER_MS;
  }

  function saveCompletion(now) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        completedAt: now,
        version: INTRO_VERSION
      }));
    } catch (_error) {
      // If storage becomes unavailable after launch, the app remains usable.
    }
  }

  function createIntro() {
    const overlay = document.createElement("section");
    overlay.id = "campusshield-launch-intro";
    overlay.className = "cs-launch-intro";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "CampusShield AI introduction");
    overlay.innerHTML = `
      <button class="cs-launch-skip" type="button">Skip intro</button>
      <div class="cs-launch-stage">
        <div class="cs-launch-map" aria-hidden="true">
          <span class="cs-launch-route cs-launch-route-one"></span>
          <span class="cs-launch-route cs-launch-route-two"></span>
          <span class="cs-launch-route cs-launch-route-three"></span>
          <span class="cs-launch-node cs-launch-node-one"></span>
          <span class="cs-launch-node cs-launch-node-two"></span>
          <span class="cs-launch-node cs-launch-node-three"></span>
        </div>
        <div class="cs-launch-mark"><img src="./assets/campusshield-logo.svg" alt="" width="96" height="96"></div>
        <p class="cs-launch-eyebrow">INTELLIGENT CAMPUS SAFETY</p>
        <h1 class="cs-launch-title">CampusShield <span>AI</span></h1>
        <p class="cs-launch-tagline">Your campus. Safer, together.</p>
        <div class="cs-launch-capabilities" aria-label="CampusShield AI features">
          <span>Stay informed</span>
          <span>Report concerns</span>
          <span>Find support</span>
        </div>
        <p class="cs-launch-status" role="status" aria-live="polite">Preparing your campus experience...</p>
        <div class="cs-launch-progress" aria-hidden="true"></div>
      </div>
    `;
    return overlay;
  }

  function start() {
    if (isPasswordRecovery()) return;

    const storageState = readStorage();
    // Prefer a fast, unobstructed launch over repeating the intro when persistent
    // storage is blocked or unavailable in the current browser context.
    if (!storageState.available || !shouldShow(storageState.record, Date.now())) return;

    const overlay = createIntro();
    document.body.appendChild(overlay);

    const skipButton = overlay.querySelector(".cs-launch-skip");
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const duration = reducedMotion ? REDUCED_MOTION_DURATION_MS : NORMAL_DURATION_MS;
    let finished = false;
    let timer = window.setTimeout(() => finish(false), duration);

    function removeOverlay() {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      saveCompletion(Date.now());
      window.clearTimeout(timer);

      if (skipped) {
        removeOverlay();
        return;
      }

      overlay.classList.add("is-leaving");
      timer = window.setTimeout(removeOverlay, EXIT_DURATION_MS);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(true);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        skipButton.focus();
      }
    }

    skipButton.addEventListener("click", () => finish(true), { once: true });
    window.addEventListener("keydown", onKeyDown, true);
    skipButton.focus({ preventScroll: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
