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
    }
    ,
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
  window.addEventListener("campusshield:profile-ready", event => {
    if (event.detail?.role) loadDashboardTimetable();
  });

  const observer = new MutationObserver(observeActiveRoute);
  observer.observe(workspace, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
  observeActiveRoute();

  // Mount the preference studio after the authenticated workspace shell exists.
  // Appearance settings do not grant access to paid or university-only features.
  void loadScript("./campusshield-studio.js?v=20261114-1")
    .then(() => window.CampusShieldStudio?.mount?.())
    .catch(error => console.warn("CampusShield Studio could not initialise.", error?.message || error));
})();
