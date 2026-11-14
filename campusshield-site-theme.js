/* CampusShield AI public theme preference.
   Public pages follow the device until the visitor selects Light or Dark. */
(() => {
  "use strict";
  const root = document.documentElement;
  const storageKey = "campusshield-public-theme:v1";
  const body = document.body;
  if (!body) return;
  const supported = body.classList.contains("public-page") ||
    body.classList.contains("offline-body") || Boolean(document.querySelector(".shell"));
  if (!supported) return;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let preference = "system";
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (_) {}
  function effectiveTheme() {
    if (preference === "light" || preference === "dark") return preference;
    return media && media.matches ? "dark" : "light";
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cs-theme-toggle";
  button.setAttribute("aria-live", "polite");
  button.title = "Change website appearance";
  function render() {
    const theme = effectiveTheme();
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#111329" : "#F6F5FC";
    button.textContent = theme === "dark" ? "☀ Light mode" : "☾ Dark mode";
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }
  button.addEventListener("click", () => {
    preference = effectiveTheme() === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(storageKey, preference); } catch (_) {}
    render();
  });
  const host = document.querySelector(".public-nav") ||
    document.querySelector(".offline-header") ||
    document.querySelector(".top-actions") ||
    document.querySelector(".public-header-row");
  if (host) host.appendChild(button);
  render();
  if (media) {
    const onSystemChange = () => { if (preference === "system") render(); };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }
})();