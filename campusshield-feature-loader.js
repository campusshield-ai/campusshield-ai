/* Load workspace-only UI modules on first visit to their page. Core auth and routing stay eager. */
(() => {
  "use strict";

  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  const scriptPromises = new Map();
  let lastRoute = "";
  let routeSequence = 0;

  const features = {
    groups: {
      scripts: ["./campus-course-community.js"]
    },
    "student-rewards": {
      scripts: ["./student-rewards.js"],
      onEnter: () => window.CampusShieldStudentRewards?.load?.({ force: true })
    },
    shieldmind: {
      scripts: ["./shieldmind-planner.js", "./shieldmind-learning-insights.js"],
      onEnter: () => {
        window.CampusShieldPlanner?.load?.();
        window.CampusShieldLearningInsights?.load?.();
      }
    },
    timetable: {
      scripts: ["./campus-timetable.js"],
      onEnter: () => window.CampusShieldTimetable?.load?.()
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

  const observer = new MutationObserver(observeActiveRoute);
  observer.observe(workspace, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
  observeActiveRoute();
})();
