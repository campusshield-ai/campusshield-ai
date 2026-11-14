/* CampusShield AI — My Campus Studio.
   Device-local presentation preferences only. No subscription, role, payment,
   academic, university, or safety permissions are modified by this module. */
(() => {
  "use strict";
  const ROOT = document.documentElement;
  const STYLE_URL = "./campusshield-my-campus-studio.css?v=20261114-1";
  const STORAGE_PREFIX = "campusshield-studio:v1:";
  const PALETTES = {
    emerald:{primary:"#0f766e"}, ocean:{primary:"#2563eb"}, violet:{primary:"#6d4ae6"},
    rose:{primary:"#be185d"}, amber:{primary:"#b45309"}
  };
  const DEFAULTS = {palette:"emerald",appearance:"system",wallpaper:"soft",density:"comfortable",fontScale:100,reduceMotion:false,customAccent:""};
  let state = Object.assign({}, DEFAULTS);
  let storageKey = "";
  let mounted = false;
  let mediaQuery = null;
  let loadSequence = 0;
  const $ = id => document.getElementById(id);

  function getUserId() {
    const backend = window.CampusShieldBackend;
    if (typeof backend?.getCurrentUser === "function") {
      return backend.getCurrentUser().then(user => user?.id || "");
    }
    if (backend?.client?.auth?.getUser) {
      return backend.client.auth.getUser().then(result => result?.data?.user?.id || "");
    }
    return Promise.resolve("");
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-campusshield-studio-style="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLE_URL;
    link.dataset.campusshieldStudioStyle = "true";
    document.head.appendChild(link);
  }

  function pageMarkup() {
    return [
      '<div class="heading profile-page-heading"><div><span class="campus-hub-eyebrow" style="color:#27816c">YOUR CAMPUS · YOUR STYLE</span><h1>My Campus Studio</h1><p>Make your CampusShield workspace feel like yours. Your preferences affect appearance only.</p></div></div>',
      '<div class="studio-page-shell">',
      '<section class="studio-hero" aria-labelledby="studio-hero-title"><div><span class="studio-hero-kicker">PERSONALISE YOUR WORKSPACE</span><h2 id="studio-hero-title">Your campus. Your colours. Your way.</h2><p>Choose a colour mood, background, display mode and workspace density. Changes preview immediately and save to this device for your signed-in account.</p></div><div class="studio-hero-preview" aria-label="Example of your personalised workspace"><div class="studio-preview-top"><span>CampusShield workspace</span><span class="studio-preview-dot"></span></div><div class="studio-preview-line"></div><div class="studio-preview-line short"></div><div class="studio-preview-actions"><span></span><span></span></div></div></section>',
      '<section class="panel studio-panel" aria-labelledby="studio-colours-title"><div class="studio-panel-heading"><div><h2 id="studio-colours-title">Colour themes</h2><p>Choose a ready-made palette for buttons, highlights and active navigation.</p></div></div>',
      '<div class="studio-option-grid" id="studio-palette-options">',
      '<button class="studio-choice" type="button" data-studio-palette="emerald" aria-pressed="true"><span class="studio-swatch-row"><i class="studio-swatch" style="background:#0f766e"></i><i class="studio-swatch" style="background:#14b8a6"></i><i class="studio-swatch" style="background:#ccfbf1"></i></span><strong>Atlantic Emerald</strong><small>CampusShield signature palette</small></button>',
      '<button class="studio-choice" type="button" data-studio-palette="ocean" aria-pressed="false"><span class="studio-swatch-row"><i class="studio-swatch" style="background:#2563eb"></i><i class="studio-swatch" style="background:#38bdf8"></i><i class="studio-swatch" style="background:#dbeafe"></i></span><strong>Ocean Blue</strong><small>Clear, cool and focused</small></button>',
      '<button class="studio-choice" type="button" data-studio-palette="violet" aria-pressed="false"><span class="studio-swatch-row"><i class="studio-swatch" style="background:#6d4ae6"></i><i class="studio-swatch" style="background:#a78bfa"></i><i class="studio-swatch" style="background:#ede9fe"></i></span><strong>Violet Focus</strong><small>A creative workspace</small></button>',
      '<button class="studio-choice" type="button" data-studio-palette="rose" aria-pressed="false"><span class="studio-swatch-row"><i class="studio-swatch" style="background:#be185d"></i><i class="studio-swatch" style="background:#f9a8d4"></i><i class="studio-swatch" style="background:#fce7f3"></i></span><strong>Rose Quartz</strong><small>Soft and expressive</small></button>',
      '<button class="studio-choice" type="button" data-studio-palette="amber" aria-pressed="false"><span class="studio-swatch-row"><i class="studio-swatch" style="background:#b45309"></i><i class="studio-swatch" style="background:#fbbf24"></i><i class="studio-swatch" style="background:#fef3c7"></i></span><strong>Golden Hour</strong><small>Warm and energetic</small></button>',
      '</div><div class="studio-color-field" style="margin-top:18px"><label for="studio-custom-accent"><strong style="font-size:12px">Custom accent colour</strong></label><input id="studio-custom-accent" type="color" value="#0f766e" aria-label="Choose a custom accent colour"><button class="studio-control-button" type="button" id="studio-apply-custom">Apply custom colour</button></div><p class="studio-inline-note">Custom colours apply to supported interface accents. Some illustrations and university-branded components retain their original colours for legibility.</p></section>',
      '<div class="studio-studio-controls">',
      '<section class="panel studio-panel" aria-labelledby="studio-appearance-title"><div class="studio-panel-heading"><div><h2 id="studio-appearance-title">Display mode</h2><p>Choose how the workspace looks throughout the day.</p></div></div><div class="studio-control-row" role="group" aria-label="Display mode"><button type="button" class="studio-control-button" data-studio-appearance="system" aria-pressed="true">System</button><button type="button" class="studio-control-button" data-studio-appearance="light" aria-pressed="false">Light</button><button type="button" class="studio-control-button" data-studio-appearance="dark" aria-pressed="false">Dark</button></div></section>',
      '<section class="panel studio-panel" aria-labelledby="studio-wallpaper-title"><div class="studio-panel-heading"><div><h2 id="studio-wallpaper-title">Wallpaper and surfaces</h2><p>Change the background mood behind your workspace.</p></div></div><div class="studio-option-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))" role="group" aria-label="Workspace wallpaper"><button type="button" class="studio-choice" data-studio-wallpaper="soft" aria-pressed="true"><span class="studio-wallpaper-swatch soft"></span><strong>Soft</strong></button><button type="button" class="studio-choice" data-studio-wallpaper="aurora" aria-pressed="false"><span class="studio-wallpaper-swatch aurora"></span><strong>Aurora</strong></button><button type="button" class="studio-choice" data-studio-wallpaper="paper" aria-pressed="false"><span class="studio-wallpaper-swatch paper"></span><strong>Paper</strong></button><button type="button" class="studio-choice" data-studio-wallpaper="midnight" aria-pressed="false"><span class="studio-wallpaper-swatch midnight"></span><strong>Midnight</strong></button></div></section>',
      '<section class="panel studio-panel" aria-labelledby="studio-layout-title"><div class="studio-panel-heading"><div><h2 id="studio-layout-title">Workspace density</h2><p>Choose how much space appears between cards and sections.</p></div></div><div class="studio-control-row" role="group" aria-label="Workspace density"><button type="button" class="studio-control-button" data-studio-density="compact" aria-pressed="false">Compact</button><button type="button" class="studio-control-button" data-studio-density="comfortable" aria-pressed="true">Comfortable</button><button type="button" class="studio-control-button" data-studio-density="spacious" aria-pressed="false">Spacious</button></div></section>',
      '<section class="panel studio-panel" aria-labelledby="studio-type-title"><div class="studio-panel-heading"><div><h2 id="studio-type-title">Text size</h2><p>Adjust interface text for comfortable reading.</p></div></div><label for="studio-font-scale"><strong id="studio-font-scale-label" style="font-size:12px">100%</strong></label><input class="studio-slider" id="studio-font-scale" type="range" min="90" max="110" step="5" value="100"><p class="studio-inline-note">This changes interface text scale only, not the content of academic records or uploaded documents.</p></section>',
      '</div>',
      '<section class="panel studio-panel" aria-labelledby="studio-accessibility-title"><div class="studio-panel-heading"><div><h2 id="studio-accessibility-title">Comfort and accessibility</h2><p>Reduce movement across supported interface elements.</p></div></div><label style="display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700"><input type="checkbox" id="studio-reduce-motion"> Reduce animations and transitions</label></section>',
      '<section class="studio-premium-card" aria-label="Premium customisation roadmap"><div><strong>More ways to make CampusShield yours</strong><p>Premium theme collections, profile frames, chat styles, AI wallpaper creation and saved dashboard presets are planned for the subscription experience. They will unlock only after benefits are connected to verified server-side subscription entitlements.</p></div><span class="pill">Coming soon</span></section>',
      '<div class="actions" style="align-items:center;justify-content:space-between"><p class="studio-status" id="studio-save-status" role="status" aria-live="polite">Your preferences are ready to customise.</p><button class="btn secondary studio-reset" type="button" id="studio-reset">Reset appearance</button></div>',
      '<p class="studio-inline-note">Privacy: appearance preferences are saved in this browser for your signed-in account. Cross-device synchronisation will use a dedicated account-preferences service. No sensitive university records are stored here.</p>',
      '</div>'
    ].join("");
  }

  function ensurePage() {
    const workspace = $("workspace");
    const content = workspace?.querySelector(".content");
    if (!workspace || !content) return null;
    let page = $("page-studio");
    if (!page) {
      page = document.createElement("section");
      page.className = "page";
      page.id = "page-studio";
      page.innerHTML = pageMarkup();
      const profilePage = $("page-profile-settings");
      if (profilePage?.parentNode === content) content.insertBefore(page, profilePage);
      else content.appendChild(page);
    }
    return page;
  }

  function ensureNavigation() {
    const nav = document.querySelector("#workspace .nav");
    if (!nav || $("campus-studio-nav")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "campus-studio-nav";
    button.dataset.page = "studio";
    button.innerHTML = '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.5 6.5 3 3"/></svg></span>My Campus Studio';
    const billingButton = $("billing-nav");
    if (billingButton?.parentNode === nav) nav.insertBefore(button, billingButton);
    else nav.appendChild(button);
  }

  function setAppearance() {
    const dark = state.appearance === "dark" ||
      (state.appearance === "system" && Boolean(mediaQuery?.matches));
    if (dark) ROOT.dataset.theme = "dark";
    else ROOT.removeAttribute("data-theme");
  }

  function clearAccentOverrides() {
    ["--cs-primary","--cs-primary-strong","--cs-primary-hover","--cs-seafoam","--cs-seafoam-soft","--cs-lime"].forEach(name => ROOT.style.removeProperty(name));
  }

  function setCustomAccent(color) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "";
    if (!safeColor) return false;
    clearAccentOverrides();
    ROOT.dataset.campusStudioPalette = "custom";
    ROOT.style.setProperty("--cs-primary", safeColor);
    ROOT.style.setProperty("--cs-primary-strong", safeColor);
    ROOT.style.setProperty("--cs-primary-hover", safeColor);
    ROOT.style.setProperty("--cs-seafoam", safeColor);
    ROOT.style.setProperty("--cs-seafoam-soft", "color-mix(in srgb, " + safeColor + " 14%, white)");
    ROOT.style.setProperty("--cs-lime", safeColor);
    state.palette = "custom";
    state.customAccent = safeColor.toLowerCase();
    return true;
  }

  function apply() {
    clearAccentOverrides();
    const palette = PALETTES[state.palette] ? state.palette : "emerald";
    ROOT.dataset.campusStudioPalette = state.palette === "custom" && state.customAccent ? "custom" : palette;
    if (state.palette === "custom" && state.customAccent) setCustomAccent(state.customAccent);
    ROOT.dataset.campusStudioWallpaper = ["soft","aurora","paper","midnight"].includes(state.wallpaper) ? state.wallpaper : "soft";
    ROOT.dataset.campusStudioReducedMotion = state.reduceMotion ? "true" : "false";
    const workspace = $("workspace");
    if (workspace) {
      workspace.dataset.campusStudioDensity = ["compact","comfortable","spacious"].includes(state.density) ? state.density : "comfortable";
      workspace.style.setProperty("--campus-studio-font-scale", String(Math.max(90, Math.min(110, Number(state.fontScale) || 100)) / 100));
    }
    setAppearance();
    syncControls();
  }

  function syncControls() {
    document.querySelectorAll("[data-studio-palette]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studioPalette === state.palette)));
    document.querySelectorAll("[data-studio-appearance]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studioAppearance === state.appearance)));
    document.querySelectorAll("[data-studio-wallpaper]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studioWallpaper === state.wallpaper)));
    document.querySelectorAll("[data-studio-density]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studioDensity === state.density)));
    const colorInput = $("studio-custom-accent");
    if (colorInput) colorInput.value = state.customAccent || PALETTES[state.palette]?.primary || PALETTES.emerald.primary;
    const scale = $("studio-font-scale");
    if (scale) scale.value = String(state.fontScale);
    const label = $("studio-font-scale-label");
    if (label) label.textContent = String(state.fontScale) + "%";
    const motion = $("studio-reduce-motion");
    if (motion) motion.checked = Boolean(state.reduceMotion);
  }

  function setStatus(message, isError) {
    const status = $("studio-save-status");
    if (!status) return;
    status.textContent = String(message || "");
    status.style.color = isError ? "#b42336" : "";
  }

  function persist() {
    if (!storageKey) {
      setStatus("Preview applied. Sign in again to save preferences for your account.", true);
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setStatus("Saved on this device for your signed-in account.");
    } catch (_error) {
      setStatus("Your changes are applied, but this browser could not save them.", true);
    }
  }

  function update(next) {
    state = Object.assign({}, state, next || {});
    apply();
    persist();
  }

  function restoreDefaults() {
    state = Object.assign({}, DEFAULTS);
    apply();
    persist();
    setStatus("Default appearance restored.");
  }

  function bindEvents() {
    const page = $("page-studio");
    if (!page || page.dataset.studioBound === "true") return;
    page.dataset.studioBound = "true";
    page.addEventListener("click", event => {
      const palette = event.target.closest("[data-studio-palette]");
      if (palette) { update({palette:palette.dataset.studioPalette,customAccent:""}); return; }
      const appearance = event.target.closest("[data-studio-appearance]");
      if (appearance) { update({appearance:appearance.dataset.studioAppearance}); return; }
      const wallpaper = event.target.closest("[data-studio-wallpaper]");
      if (wallpaper) { update({wallpaper:wallpaper.dataset.studioWallpaper}); return; }
      const density = event.target.closest("[data-studio-density]");
      if (density) { update({density:density.dataset.studioDensity}); return; }
      if (event.target.closest("#studio-apply-custom")) {
        const input = $("studio-custom-accent");
        if (!setCustomAccent(input?.value)) { setStatus("Choose a valid colour before applying it.", true); return; }
        apply();
        persist();
        return;
      }
      if (event.target.closest("#studio-reset")) restoreDefaults();
    });
    $("studio-font-scale")?.addEventListener("input", event => {
      update({fontScale:Math.max(90,Math.min(110,Number(event.target.value)||100))});
    });
    $("studio-reduce-motion")?.addEventListener("change", event => update({reduceMotion:Boolean(event.target.checked)}));
  }

  async function load() {
    const sequence = ++loadSequence;
    state = Object.assign({}, DEFAULTS);
    const page = ensurePage();
    if (!page) return;
    ensureNavigation();
    bindEvents();
    const title = $("sectionTitle");
    if (title && page.classList.contains("active")) title.textContent = "My Campus Studio";
    try {
      const userId = await getUserId();
      if (sequence !== loadSequence) return;
      storageKey = userId ? STORAGE_PREFIX + userId : "";
      if (storageKey) {
        const raw = localStorage.getItem(storageKey);
        if (raw) state = Object.assign({}, DEFAULTS, JSON.parse(raw));
        setStatus("Your preferences are saved locally for this signed-in account.");
      } else {
        state = Object.assign({}, DEFAULTS);
        setStatus("Changes can be previewed now. Sign in again to save preferences.", true);
      }
    } catch (_error) {
      if (sequence !== loadSequence) return;
      state = Object.assign({}, DEFAULTS);
      setStatus("Preferences could not be loaded. You can still preview this Studio session.", true);
    }
    if (sequence === loadSequence) apply();
  }

  function mount() {
    if (mounted) return;
    ensureStylesheet();
    const page = ensurePage();
    if (!page) return;
    ensureNavigation();
    bindEvents();
    mounted = true;
    mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", () => {
      if (state.appearance === "system") setAppearance();
    });
    window.addEventListener("campusshield:profile-ready", event => {
      if (event.detail?.role) void load();
    });
    window.addEventListener("campusshield:session-signed-out", () => {
      loadSequence++;
      storageKey = "";
      state = Object.assign({}, DEFAULTS);
      apply();
    });
  }

  window.CampusShieldStudio = {mount,load,reset:restoreDefaults};
})();