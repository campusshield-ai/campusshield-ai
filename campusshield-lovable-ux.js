/*
 * CampusShield AI — Lovable-inspired accessibility integration.
 * No data, auth, backend or route behaviour is added here.
 */
(() => {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  function syncCurrentNavigation() {
    const activePage = workspace.querySelector(".page.active");
    const pageId = activePage?.id?.replace(/^page-/, "") || "";
    const navButtons = Array.from(workspace.querySelectorAll(
      "#app-sidebar .nav button[data-page], #app-sidebar .sidebar-guide-access button[data-page], .mobile-bottom-nav button[data-page]"
    ));

    const candidates = navButtons.filter((button) =>
      Boolean(pageId) && (
        button.dataset.page === pageId ||
        (button.id === "community-nav" && pageId === "groups") ||
        (button.id === "events-services-nav" && ["noticeboard", "helpdesk"].includes(pageId))
      )
    );
    // When a route is shared, the app's active class identifies the exact
    // sidebar destination that was clicked. For direct page changes (such as
    // restored routes and accessibility tests), fall back to the canonical
    // route item and its equivalent mobile-navigation item.
    const activeCandidates = candidates.filter((button) => button.classList.contains("active"));
    let currentButtons = activeCandidates;
    if (!currentButtons.length) {
      const canonical = candidates.filter((button) => button.dataset.navKey === pageId);
      const sharedNavigation = candidates.filter((button) => !button.dataset.navKey);
      currentButtons = [...canonical, ...sharedNavigation];
      if (!currentButtons.length) currentButtons = candidates;
    }
    const currentSet = new Set(currentButtons);

    navButtons.forEach((button) => {
      if (currentSet.has(button)) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  syncCurrentNavigation();
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "class")) {
      syncCurrentNavigation();
    }
  });
  observer.observe(workspace, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  // The real report form is connected to the configured CampusShield backend.
  // Preserve its honest emergency boundary and expose it as a labelled note.
  const emergencyNote = workspace.querySelector("#page-report .report-emergency-note");
  if (emergencyNote) {
    emergencyNote.setAttribute("role", "note");
    emergencyNote.setAttribute("aria-label", "Important emergency reporting limitation");
  }

  const searchInput = workspace.querySelector("#campus-global-search");
  if (searchInput) {
    searchInput.setAttribute("role", "combobox");
    searchInput.setAttribute("aria-autocomplete", "list");
    searchInput.setAttribute("aria-haspopup", "listbox");
    searchInput.setAttribute("aria-controls", "campus-global-search-options");
  }
})();
