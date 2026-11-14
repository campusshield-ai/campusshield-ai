/* Load workspace-only UI modules on first visit to their page. Core auth and routing stay eager. */
(() => {
  "use strict";

  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  const scriptPromises = new Map();
  let lastRoute = "";
  let routeSequence = 0;
  let dashboardTimetableScriptPromise = null;

  const features = {
    dashboard: {
      scripts: ["./campusshield-campus-home.js?v=20261114-1"],
      onEnter: () => window.CampusShieldCampusHome?.load?.()
    },
    groups: {
      scripts: ["./campus-course-community.js"]
    },
    "student-rewards": {
      scripts: ["./student-rewards.js"],
      onEnter: () => window.CampusShieldStudentRewards?.load?.({ force: true })
    },
    "admin-rewards": {
      scripts: ["./student-rewards-admin.js?v=20261113-1"],
      onEnter: () => window.CampusShieldAdminRewards?.load?.()
    },
    "past-questions": {
      scripts: ["./past-question-practice.js?v=20261113-1"],
      onEnter: () => window.PastQuestionPractice?.load?.()
    },
    classroom: {
      scripts: ["./campus-live-classroom.js?v=20261113-1"]
    },
    shieldmind: {
      scripts: ["./shieldmind-planner.js", "./shieldmind-learning-insights.js", "./shieldmind-study-room.js?v=20261114-2"],
      onEnter: () => {
        window.CampusShieldPlanner?.load?.();
        window.CampusShieldLearningInsights?.load?.();
      }
    },
    timetable: {
      scripts: ["./campus-timetable.js"],
      onEnter: () => {
        if (!window.CampusShieldTimetable?.getTodaySnapshot?.().loaded) {
          window.CampusShieldTimetable?.load?.();
        }
      }
    },
    community: {
      scripts: ["./campus-ideas-impact.js"]
    },
    marketplace: {
      scripts: ["./campus-discovery-ui.js"]
    },
    opportunities: {
      scripts: ["./campus-discovery-ui.js"]
    },
    "campus-contacts": {
      scripts: ["./campus-service-directory.js"]
    },
    guide: {
      scripts: ["./campusshield-guide.js"]
    },
    "creator-tools": {
      scripts: ["./student-creator-tools.js"]
    },
    "campus-chat": {
      scripts: ["./campus-chat-room-enhancements.js", "./campus-voice-notes.js"]
    },
    "campus-messages": {
      scripts: ["./campus-private-messages-polish.js?v=20261112-4", "./campus-voice-notes.js"]
    },
    studio: {
      scripts: ["./campusshield-studio.js?v=20261114-1"],
      onEnter: () => window.CampusShieldStudio?.load?.()
    }
  };

  function loadScript(source) {
    const absoluteUrl = new URL(source, document.baseURI).href;
    if (scriptPromises.has(absoluteUrl)) return scriptPromises.get(absoluteUrl);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = absoluteUrl;
      script.async = false;
      script.dataset.campusshieldLazyFeature = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromises.delete(absoluteUrl);
        reject(new Error("Workspace feature could not be loaded: " + source));
      };
      document.head.appendChild(script);
    });
    scriptPromises.set(absoluteUrl, promise);
    return promise;
  }

  function activeRoute() {
    // Do not download signed-in workspace features while the login screen is active.
    if (workspace.hidden) return null;
    const page = workspace.querySelector(".page.active");
    if (!page || !page.id.startsWith("page-")) return null;
    return { name: page.id.slice(5), page };
  }

  async function enterFeature(route, page, sequence) {
    const feature = features[route];
    if (!feature) return;
    try {
      await Promise.all(feature.scripts.map(loadScript));
      if (sequence !== routeSequence || !page.isConnected || !page.classList.contains("active")) return;
      feature.onEnter?.();
      page.dataset.featureLoaded = "true";
    } catch (error) {
      console.warn("CampusShield feature loading failed.", {
        feature: route,
        message: error?.message || "Unknown loading error"
      });
      page.dataset.featureLoadError = "true";
    }
  }

  function observeActiveRoute() {
    const current = activeRoute();
    const nextRoute = current?.name || "";
    if (nextRoute === lastRoute) return;
    lastRoute = nextRoute;
    const sequence = ++routeSequence;
    if (current && features[current.name]) {
      void enterFeature(current.name, current.page, sequence);
    }
  }

  function loadDashboardTimetable() {
    if (!dashboardTimetableScriptPromise) {
      dashboardTimetableScriptPromise = loadScript("./campus-timetable.js").catch(error => {
        dashboardTimetableScriptPromise = null;
        console.warn("CampusShield dashboard timetable could not load.", {
          message: error?.message || "Unknown loading error"
        });
        return null;
      });
    }
    dashboardTimetableScriptPromise.then(() => {
      if (window.CampusShieldTimetable) void window.CampusShieldTimetable.load();
    });
  }

  // The dashboard's My Day card uses the timetable snapshot too. Keep the
  // timetable module out of public login startup, but load it after a verified
  // profile is ready so the signed-in dashboard is complete without navigation.
  async function restoreSavedStudioPreferences() {
    try {
      const auth = window.CampusShieldBackend?.client?.auth;
      if (!auth?.getSession) return;
      const sessionResult = await auth.getSession();
      const userId = sessionResult?.data?.session?.user?.id;
      if (!userId) return;
      const raw = localStorage.getItem("campusshield-studio:v1:" + userId);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (!prefs || typeof prefs !== "object") return;

      if (!document.querySelector('link[data-campusshield-studio-style="true"]')) {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = "./campusshield-my-campus-studio.css?v=20261114-1";
        style.dataset.campusshieldStudioStyle = "true";
        document.head.appendChild(style);
      }

      const root = document.documentElement;
      const palettes = ["emerald", "ocean", "violet", "rose", "amber"];
      const palette = palettes.includes(prefs.palette) ? prefs.palette : "emerald";
      const custom = /^#[0-9a-f]{6}$/i.test(String(prefs.customAccent || "")) ? prefs.customAccent : "";
      root.dataset.campusStudioPalette = custom && prefs.palette === "custom" ? "custom" : palette;
      ["--cs-primary","--cs-primary-strong","--cs-primary-hover","--cs-seafoam","--cs-seafoam-soft","--cs-lime"].forEach(name => root.style.removeProperty(name));
      if (custom && prefs.palette === "custom") {
        root.style.setProperty("--cs-primary", custom);
        root.style.setProperty("--cs-primary-strong", custom);
        root.style.setProperty("--cs-primary-hover", custom);
        root.style.setProperty("--cs-seafoam", custom);
        root.style.setProperty("--cs-seafoam-soft", "color-mix(in srgb, " + custom + " 14%, white)");
        root.style.setProperty("--cs-lime", custom);
      }
      const wallpapers = ["soft","aurora","paper","midnight"];
      root.dataset.campusStudioWallpaper = wallpapers.includes(prefs.wallpaper) ? prefs.wallpaper : "soft";
      root.dataset.campusStudioReducedMotion = prefs.reduceMotion === true ? "true" : "false";
      const density = ["compact","comfortable","spacious"].includes(prefs.density) ? prefs.density : "comfortable";
      workspace.dataset.campusStudioDensity = density;
      const scale = Math.max(90, Math.min(110, Number(prefs.fontScale) || 100)) / 100;
      workspace.style.setProperty("--campus-studio-font-scale", String(scale));
      const dark = prefs.appearance === "dark" ||
        (prefs.appearance === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
      if (dark) root.dataset.theme = "dark";
      else root.removeAttribute("data-theme");
    } catch (error) {
      console.warn("CampusShield saved appearance preferences could not be restored.", error?.message || error);
    }
  }

  function clearStudioAppearance() {
    const root = document.documentElement;
    ["data-campus-studio-palette","data-campus-studio-wallpaper","data-campus-studio-reduced-motion","data-theme"].forEach(name => root.removeAttribute(name));
    ["--cs-primary","--cs-primary-strong","--cs-primary-hover","--cs-seafoam","--cs-seafoam-soft","--cs-lime"].forEach(name => root.style.removeProperty(name));
    workspace.removeAttribute("data-campus-studio-density");
    workspace.style.removeProperty("--campus-studio-font-scale");
  }

  window.addEventListener("campusshield:profile-ready", event => {
    if (event.detail?.role) {
      loadDashboardTimetable();
      void restoreSavedStudioPreferences();
    }
  });
  window.addEventListener("campusshield:profile-cleared", clearStudioAppearance);
  window.addEventListener("campusshield:session-signed-out", clearStudioAppearance);

  const observer = new MutationObserver(observeActiveRoute);
  observer.observe(workspace, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });
  observeActiveRoute();

  // Add the route shell without downloading Studio code during dashboard startup.
  // The Studio bundle and stylesheet load only when a student opens the route.
  function ensureStudioEntry() {
    const nav = workspace.querySelector(".nav");
    const content = workspace.querySelector(".content");
    if (!nav || !content) return;

    if (!workspace.querySelector("#campus-studio-nav")) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "campus-studio-nav";
      button.dataset.page = "studio";
      button.innerHTML = '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.5 6.5 3 3"/></svg></span>My Campus Studio';
      const billingButton = workspace.querySelector("#billing-nav");
      if (billingButton && billingButton.parentNode === nav) nav.insertBefore(button, billingButton);
      else nav.appendChild(button);
    }

    if (!workspace.querySelector("#page-studio")) {
      const page = document.createElement("section");
      page.className = "page";
      page.id = "page-studio";
      page.setAttribute("aria-label", "My Campus Studio");
      page.innerHTML = '<section class="panel"><p>My Campus Studio loads when you open this page.</p></section>';
      const profilePage = workspace.querySelector("#page-profile-settings");
      if (profilePage && profilePage.parentNode === content) content.insertBefore(page, profilePage);
      else content.appendChild(page);
    }
  }

  ensureStudioEntry();
  observeActiveRoute();
})();
