/* CampusShield AI — persistent, accessible light/dark theme preference. */
(() => {
  "use strict";

  const STORAGE_KEY = "campusshield-theme-mode";
  const root = document.documentElement;
  const systemPreference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function readSavedPreference() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch (_) {
      return "system";
    }
  }

  let preference = readSavedPreference();

  function resolvedTheme() {
    if (preference === "light" || preference === "dark") return preference;
    return systemPreference?.matches ? "dark" : "light";
  }

  function applyTheme() {
    const theme = resolvedTheme();
    const nextTheme = theme === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", theme);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "#0b171b" : "#0d3b2e");

    const button = document.getElementById("campusshield-theme-toggle");
    if (button) {
      button.setAttribute("aria-label", "Switch to " + nextTheme + " mode");
      button.setAttribute("title", "Switch to " + nextTheme + " mode");
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.dataset.currentTheme = theme;

      const sun = button.querySelector("[data-theme-icon='sun']");
      const moon = button.querySelector("[data-theme-icon='moon']");
      if (sun) sun.hidden = theme !== "dark";
      if (moon) moon.hidden = theme === "dark";

      const label = button.querySelector(".cs-theme-toggle-label");
      if (label) label.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    }
  }

  function setPreference(next) {
    if (next !== "light" && next !== "dark") return;
    preference = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {
      // The selected theme still applies for this page even when storage is unavailable.
    }
    applyTheme();
  }

  function attachToggle() {
    const button = document.getElementById("campusshield-theme-toggle");
    if (!button || button.dataset.themeReady === "true") return;
    button.dataset.themeReady = "true";
    button.addEventListener("click", () => {
      setPreference(resolvedTheme() === "dark" ? "light" : "dark");
    });
    applyTheme();
  }

  // Apply before the page is painted, then attach once the header exists.
  applyTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachToggle, { once: true });
  } else {
    attachToggle();
  }

  if (systemPreference) {
    const onSystemThemeChange = () => {
      if (preference === "system") applyTheme();
    };
    if (typeof systemPreference.addEventListener === "function") {
      systemPreference.addEventListener("change", onSystemThemeChange);
    } else if (typeof systemPreference.addListener === "function") {
      systemPreference.addListener(onSystemThemeChange);
    }
  }

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    preference = event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system";
    applyTheme();
  });
})();
