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
      const topicName = activeFilter === "all"
        ? "all topics"
        : (filters.find((button) => button.dataset.guideFilter === activeFilter)?.textContent.trim() || "selected topics");
      results.textContent = "Showing " + visibleCount + " of " + cards.length + " guide topics · " + topicName + ".";
    }
    if (noResults) noResults.hidden = visibleCount !== 0;
  }

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.guideFilter || "all";
      filters.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      applyFilters();
    });
  });

  search?.addEventListener("input", applyFilters);
  applyFilters();
})();