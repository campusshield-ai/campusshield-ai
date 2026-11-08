(() => {
  "use strict";
  const root = document.getElementById("page-guide");
  if (!root) return;
  const search = root.querySelector("#guide-search-input");
  const results = root.querySelector("#guide-results");
  const noResults = root.querySelector("#guide-no-results");
  const cards = Array.from(root.querySelectorAll("[data-guide-card]"));
  const filters = Array.from(root.querySelectorAll("[data-guide-filter]"));
  let activeFilter = "all";

  function applyFilters() {
    const query = String(search?.value || "").trim().toLocaleLowerCase();
    let visibleCount = 0;
    cards.forEach((card) => {
      const topicMatches = activeFilter === "all" || card.dataset.guideTopic === activeFilter;
      const textMatches = !query || card.textContent.toLocaleLowerCase().includes(query);
      const visible = topicMatches && textMatches;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });
    if (results) {
      const topicName = activeFilter === "all" ? "all topics" :
        (filters.find((button) => button.dataset.guideFilter === activeFilter)?.textContent.trim() || "selected topics");
      results.textContent = "Showing " + visibleCount + " of " + cards.length + " guide topics · " + topicName + ".";
    }
    if (noResults) noResults.hidden = visibleCount !== 0;
  }

  filters.forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.guideFilter || "all";
    filters.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    applyFilters();
  }));
  search?.addEventListener("input", applyFilters);
  applyFilters();

  // Walkthrough progress stays in memory for this browser session. It is not
  // written to Supabase or persisted on a shared device.
  const journeys = [
    { id:"setup", kicker:"YOUR FIRST STEPS", steps:[
      { title:"Complete your profile", description:"Add the details you want CampusShield to use in your workspace. Keep your email and account information accurate.", page:"profile-settings", action:"Open profile settings" },
      { title:"Choose your university", description:"Open CampusPulse and select the correct university. Campus-specific groups, courses, events and services depend on the institution attached to your account.", page:"community", action:"Open CampusPulse" },
      { title:"Check your access", description:"Some student, teacher and staff tools require identity or campus-role review. Submit evidence only through the private verification flow when CampusShield requests it; never post it in chat or comments.", page:"profile-settings", action:"Review profile and access" }
    ]},
    { id:"safety", kicker:"SAFETY & FOLLOW-UP", steps:[
      { title:"Open incident reporting", description:"Choose the closest category and severity. Report facts you observed, including when and where it happened. Do not delay contacting campus security or emergency services when someone is in immediate danger.", page:"report", action:"Open incident reporting" },
      { title:"Submit a clear report", description:"Add a concise description and only the evidence needed to explain the incident. Review the details before submitting. Sensitive reports belong in private incident reporting, not public CampusPulse posts.", page:"report", action:"Return to incident reporting" },
      { title:"Follow the report status", description:"Use the incident-management area available to your account to review updates. Access to other people's reports and staff actions is restricted by role and campus permissions.", page:"manage", action:"Open incident management" }
    ]},
    { id:"discover", kicker:"CAMPUS LIFE & DISCOVERY", steps:[
      { title:"Browse the Marketplace", description:"Search student listings, use category and availability filters, and review listing details before contacting a seller. Confirm terms directly with the other party.", page:"marketplace", action:"Open Marketplace" },
      { title:"Find opportunities", description:"Search available opportunities and sort by category, deadline or recent activity. Check the organiser, eligibility and closing date before applying.", page:"opportunities", action:"Open Opportunity Hub" },
      { title:"Connect with campus life", description:"Explore CampusPulse, groups and events. Some networking or contribution tools require verified campus membership and may vary by university.", page:"community", action:"Open CampusPulse" }
    ]},
    { id:"study", kicker:"YOUR STUDY WORKFLOW", steps:[
      { title:"Add your classes and tasks", description:"Use your private timetable for classes, assignments, revision sessions and reminders. Check dates and times before saving.", page:"timetable", action:"Open my timetable" },
      { title:"Find course resources", description:"Browse course materials and communities available to your university. Verify the course code, academic year and source of each resource.", page:"courses", action:"Open courses" },
      { title:"Use ShieldMind thoughtfully", description:"Ask focused questions, request explanations and practise. Check important answers against lecture notes and official course materials; AI output can be wrong.", page:"shieldmind", action:"Open ShieldMind AI" }
    ]},
    { id:"map", kicker:"CAMPUS ORIENTATION", steps:[
      { title:"Choose the campus", description:"Open CampusMap and select the university campus you want to explore. Coverage and verified building information differ between campuses.", page:"campus-map", action:"Open CampusMap" },
      { title:"Search and inspect places", description:"Search for a building or facility, then inspect its source and verification label. OpenStreetMap outlines can provide reference context; they are not automatically university-verified.", page:"campus-map", action:"Explore campus locations" },
      { title:"Use map layers carefully", description:"Switch available map styles and layers to inspect roads, buildings and facilities. Only use device location after choosing a location feature and granting browser permission.", page:"campus-map", action:"Open map layers" }
    ]},
    { id:"mobile", kicker:"WEBSITE & MOBILE APP", steps:[
      { title:"Open installation guidance", description:"CampusShield is an installable website experience. On supported browsers, use the Install app prompt; on iPhone or iPad, open the site in Safari and choose Add to Home Screen.", guideTarget:"guide-install-details", action:"Show installation instructions" },
      { title:"Keep the app current", description:"Reconnect to the internet and reload CampusShield to receive the latest website version. Signing in, submitting reports, messaging and loading live campus data require internet access.", guideTarget:"guide-install-details", action:"Review mobile app guidance" }
    ]}
  ];

  const choices = Array.from(root.querySelectorAll("[data-guide-journey]"));
  const counter = root.querySelector("#guide-walkthrough-step-count");
  const completion = root.querySelector("#guide-walkthrough-completion");
  const progress = root.querySelector("#guide-walkthrough-progress");
  const progressFill = root.querySelector("#guide-walkthrough-progress-fill");
  const kicker = root.querySelector("#guide-walkthrough-kicker");
  const stepTitle = root.querySelector("#guide-walkthrough-step-title");
  const stepDescription = root.querySelector("#guide-walkthrough-step-description");
  const note = root.querySelector("#guide-walkthrough-note");
  const openButton = root.querySelector("#guide-walkthrough-open");
  const completeButton = root.querySelector("#guide-walkthrough-complete");
  const previousButton = root.querySelector("#guide-walkthrough-previous");
  const nextButton = root.querySelector("#guide-walkthrough-next");
  const completedByJourney = new Map();
  let activeJourney = journeys[0];
  let activeStep = 0;

  function availablePage(page) {
    if (!page) return false;
    return Array.from(document.querySelectorAll("[data-page]")).some((element) => element.dataset.page === page);
  }
  function completedSteps(journey) {
    if (!completedByJourney.has(journey.id)) completedByJourney.set(journey.id, new Set());
    return completedByJourney.get(journey.id);
  }

  function renderWalkthrough(message = "") {
    if (!activeJourney || !activeJourney.steps.length) return;
    const step = activeJourney.steps[activeStep];
    const done = completedSteps(activeJourney);
    const total = activeJourney.steps.length;
    const isDone = done.has(activeStep);
    const percentage = Math.round((done.size / total) * 100);
    const hasRoute = Boolean(step.page && availablePage(step.page));
    const hasGuideTarget = Boolean(step.guideTarget && document.getElementById(step.guideTarget));

    choices.forEach((button) => {
      const active = button.dataset.guideJourney === activeJourney.id;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (counter) counter.textContent = "STEP " + (activeStep + 1) + " OF " + total;
    if (completion) completion.textContent = done.size + " OF " + total + " COMPLETED";
    if (progress) {
      progress.setAttribute("aria-valuemax", String(total));
      progress.setAttribute("aria-valuenow", String(done.size));
    }
    if (progressFill) progressFill.style.width = percentage + "%";
    if (kicker) kicker.textContent = activeJourney.kicker;
    if (stepTitle) stepTitle.textContent = step.title;
    if (stepDescription) stepDescription.textContent = step.description;
    if (completeButton) {
      completeButton.textContent = isDone ? "Step completed ✓" : "Mark step complete";
      completeButton.setAttribute("aria-pressed", isDone ? "true" : "false");
    }
    if (previousButton) previousButton.disabled = activeStep === 0;
    if (nextButton) nextButton.textContent = activeStep === total - 1 ? "Restart walkthrough ↻" : "Next step →";
    if (openButton) {
      openButton.hidden = !(hasRoute || hasGuideTarget);
      openButton.disabled = !(hasRoute || hasGuideTarget);
      openButton.textContent = step.action || "Open feature";
      if (hasRoute) openButton.dataset.page = step.page;
      else delete openButton.dataset.page;
      if (hasGuideTarget) openButton.dataset.guideTarget = step.guideTarget;
      else delete openButton.dataset.guideTarget;
    }
    if (note) note.textContent = message || (step.page && !hasRoute
      ? "This feature is not available in the current build. Check with your university for availability."
      : "Your progress stays in this browser session; no walkthrough activity is sent to the server.");
  }

  choices.forEach((button) => button.addEventListener("click", () => {
    const selected = journeys.find((journey) => journey.id === button.dataset.guideJourney);
    if (!selected) return;
    activeJourney = selected;
    activeStep = 0;
    renderWalkthrough();
  }));
  completeButton?.addEventListener("click", () => {
    const done = completedSteps(activeJourney);
    if (done.has(activeStep)) done.delete(activeStep);
    else done.add(activeStep);
    renderWalkthrough(done.has(activeStep) ? "Step marked complete." : "Step reopened. You can mark it complete again when ready.");
  });
  previousButton?.addEventListener("click", () => {
    if (activeStep <= 0) return;
    activeStep -= 1;
    renderWalkthrough();
  });
  nextButton?.addEventListener("click", () => {
    if (activeStep < activeJourney.steps.length - 1) {
      activeStep += 1;
      renderWalkthrough();
      return;
    }
    activeStep = 0;
    completedByJourney.set(activeJourney.id, new Set());
    renderWalkthrough("Walkthrough restarted. Your completion progress has been reset for this journey.");
  });
  openButton?.addEventListener("click", () => {
    const targetId = openButton.dataset.guideTarget;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.open = true;
    target.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "center"
    });
    target.querySelector("summary")?.focus({ preventScroll: true });
  });
  renderWalkthrough();
})();