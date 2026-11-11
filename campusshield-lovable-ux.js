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
    const navButtons = workspace.querySelectorAll(
      "#app-sidebar .nav button[data-page], #app-sidebar .sidebar-guide-access button[data-page], .mobile-bottom-nav button[data-page]"
    );
    navButtons.forEach((button) => {
      const current = Boolean(pageId) && button.classList.contains("active");
      if (current) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
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
