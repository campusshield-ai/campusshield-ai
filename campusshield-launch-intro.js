/* CampusShield AI — first launch + first opening every Monday. */
(() => {
  "use strict";

  const STORAGE_KEY = "campusshield.launchIntro.v1";

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
      const record = raw ? JSON.parse(raw) : null;
      return {
        available: true,
        record: record && typeof record === "object" && !Array.isArray(record) ? record : null
      };
    } catch (_error) {
      return { available: false, record: null };
    }
  }

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function firstShownAt(record) {
    if (!record || typeof record !== "object") return null;
    const value = Number(record.firstShownAt ?? record.completedAt);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function lastMondayShown(record) {
    if (!record || typeof record !== "object") return null;

    if (typeof record.lastMondayShown === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(record.lastMondayShown)) {
      return record.lastMondayShown;
    }

    // Upgrade existing v1 records without replaying the intro twice on the
    // same Monday. Legacy records stored only the completion timestamp.
    const legacyCompletedAt = Number(record.completedAt);
    if (Number.isFinite(legacyCompletedAt) && legacyCompletedAt > 0) {
      const legacyDate = new Date(legacyCompletedAt);
      if (legacyDate.getDay() === 1) return localDateKey(legacyDate);
    }
    return null;
  }

  function shouldShow(record, now) {
    // The very first app opening is always the brand introduction.
    if (!firstShownAt(record)) return true;

    const today = new Date(now);
    if (today.getDay() !== 1) return false;

    // On Mondays, show only on the first app opening of that local calendar day.
    return lastMondayShown(record) !== localDateKey(today);
  }

  function saveCompletion(now, previousRecord) {
    const today = new Date(now);
    const mondayAlreadyShown = lastMondayShown(previousRecord);
    const record = {
      firstShownAt: firstShownAt(previousRecord) || now,
      lastMondayShown: today.getDay() === 1 ? localDateKey(today) : mondayAlreadyShown,
      version: "2.0.0"
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
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
    // Prefer an immediate app launch when persistent storage is unavailable.
    if (!storageState.available || !shouldShow(storageState.record, Date.now())) return;

    const overlay = createIntro();
    document.body.classList.add("cs-launch-active");
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
      document.body.classList.remove("cs-launch-active");
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      saveCompletion(Date.now(), storageState.record);
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
