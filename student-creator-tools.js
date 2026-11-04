(() => {
  "use strict";
  const root = document.getElementById("page-creator-tools");
  if (!root || root.dataset.creatorToolsReady === "true") return;
  root.dataset.creatorToolsReady = "true";

  const search = root.querySelector("#creator-tools-search");
  const cards = Array.from(root.querySelectorAll(".creator-tool-card"));
  const filters = Array.from(root.querySelectorAll("[data-creator-filter]"));
  const count = root.querySelector("#creator-tools-count");
  const empty = root.querySelector("#creator-tools-empty");
  const reset = root.querySelector("#creator-tools-reset");
  let activeCategory = "all";

  function applyFilters() {
    const query = String(search?.value || "").trim().toLocaleLowerCase();
    let visible = 0;

    cards.forEach((card) => {
      const categoryMatch = activeCategory === "all" || card.dataset.category === activeCategory;
      const haystack = (card.dataset.search || card.textContent || "").toLocaleLowerCase();
      const queryMatch = !query || haystack.includes(query);
      const show = categoryMatch && queryMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });

    if (count) count.textContent = visible + (visible === 1 ? " tool" : " tools");
    if (empty) empty.hidden = visible !== 0;
  }

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.creatorFilter || "all";
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      applyFilters();
    });
  });

  search?.addEventListener("input", applyFilters);
  reset?.addEventListener("click", () => {
    if (search) search.value = "";
    activeCategory = "all";
    filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.creatorFilter === "all")));
    applyFilters();
    search?.focus();
  });

  applyFilters();
})();
