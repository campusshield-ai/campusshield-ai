/* CampusShield AI — client-side discovery controls for authorized campus feeds.
   These controls filter only cards already rendered by account-scoped queries. */
(() => {
  const $ = id => document.getElementById(id);
  const normal = value => String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const categoryKey = value => {
    const key = normal(value);
    if (key.includes("book") || key.includes("study_material")) return "books";
    if (key.includes("service")) return "services";
    if (key.includes("free_offer") || key === "gifts") return "gift";
    return key;
  };
  function makeField(labelText, id, kind, options, placeholder) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    const control = document.createElement(kind === "search" ? "input" : "select");
    control.id = id;
    if (kind === "search") {
      control.type = "search";
      control.maxLength = 100;
      control.placeholder = placeholder || "";
      control.autocomplete = "off";
    } else {
      options.forEach(option => {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        control.append(node);
      });
    }
    wrapper.append(label, control);
    return {wrapper, control};
  }
  function priceOf(card) {
    const explicit = card.dataset.price;
    if (explicit !== undefined && explicit !== "") {
      const value = Number(explicit);
      if (Number.isFinite(value)) return value;
    }
    const match = String(card.textContent || "").match(/(?:₦|NGN)\s*([\d,]+(?:\.\d+)?)/i);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  }
  function dateOf(card, key) {
    const raw = card.dataset[key] || "";
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  function cardsOf(feed) {
    return Array.from(feed.children).filter(node => node.tagName === "ARTICLE");
  }
  function buildControls(config) {
    const feed = $(config.feedId);
    const status = $(config.statusId);
    if (!feed || $(config.searchId)) return null;
    const toolbar = document.createElement("div");
    toolbar.className = "campus-live-discovery-toolbar";
    toolbar.setAttribute("aria-label", config.ariaLabel);
    const searchField = makeField(config.searchLabel, config.searchId, "search", null, config.placeholder);
    const categoryField = makeField("Category", config.categoryId, "select", config.categories);
    toolbar.append(searchField.wrapper, categoryField.wrapper);
    const controls = {search:searchField.control, category:categoryField.control};
    if (config.availabilityId) {
      const field = makeField("Availability", config.availabilityId, "select", config.availability);
      toolbar.append(field.wrapper);
      controls.availability = field.control;
    }
    const sortField = makeField("Sort by", config.sortId, "select", config.sort);
    toolbar.append(sortField.wrapper);
    controls.sort = sortField.control;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "campus-live-discovery-clear";
    reset.textContent = "Clear filters";
    reset.setAttribute("aria-label", "Clear discovery filters");
    toolbar.append(reset);
    const results = document.createElement("p");
    results.id = config.resultsId;
    results.className = "campus-live-discovery-results";
    results.setAttribute("aria-live", "polite");
    if (status) status.insertAdjacentElement("afterend", toolbar);
    else feed.before(toolbar);
    toolbar.insertAdjacentElement("afterend", results);
    feed.classList.add("campus-live-discovery-feed");
    const originalOrder = new WeakMap();
    let orderSeed = 0;
    const apply = () => {
      const cards = cardsOf(feed);
      cards.forEach(card => {
        if (!originalOrder.has(card)) originalOrder.set(card, orderSeed++);
      });
      const query = normal(controls.search.value);
      const wantedCategory = controls.category.value;
      const wantedAvailability = controls.availability ? controls.availability.value : "all";
      const visible = [];
      cards.forEach(card => {
        const body = normal(card.textContent || "");
        const category = categoryKey(card.dataset.category || card.querySelector(".tag")?.textContent || "");
        const statusText = normal(card.querySelector(".community-meta strong")?.textContent || card.textContent || "");
        const isSold = statusText.includes("sold") || card.dataset.status === "sold";
        const isAvailable = !isSold && (statusText.includes("available") ||
          card.dataset.status === "published" || card.dataset.status === "available");
        const categoryMatches = wantedCategory === "all" || category === wantedCategory ||
          (wantedCategory === "other" && !["books","electronics","accommodation","services","clothing","furniture"].includes(category));
        const availabilityMatches = wantedAvailability === "all" ||
          (wantedAvailability === "sold" ? isSold : isAvailable);
        const matches = (!query || body.includes(query)) && categoryMatches && availabilityMatches;
        card.hidden = !matches;
        if (matches) visible.push(card);
      });
      visible.sort((a,b) => {
        const sort = controls.sort.value;
        if (sort === "price-low" || sort === "price-high") {
          const av = priceOf(a), bv = priceOf(b);
          if (av === null && bv !== null) return 1;
          if (bv === null && av !== null) return -1;
          return sort === "price-low" ? av - bv : bv - av;
        }
        if (sort === "deadline") {
          const aa = dateOf(a, "deadline");
          const bb = dateOf(b, "deadline");
          return (aa === null ? Number.POSITIVE_INFINITY : aa) - (bb === null ? Number.POSITIVE_INFINITY : bb);
        }
        if (sort === "newest") {
          const aa = dateOf(a, "createdAt");
          const bb = dateOf(b, "createdAt");
          if (aa === null && bb === null) return originalOrder.get(a) - originalOrder.get(b);
          if (aa === null) return 1;
          if (bb === null) return -1;
          return bb - aa;
        }
        if (sort === "alphabetical") {
          const aTitle = a.querySelector("h2,h3,h4")?.textContent || a.textContent || "";
          const bTitle = b.querySelector("h2,h3,h4")?.textContent || b.textContent || "";
          return aTitle.localeCompare(bTitle);
        }
        return originalOrder.get(a) - originalOrder.get(b);
      });
      const visibleOrder = new Map(visible.map((card,index) => [card,index]));
      cards.forEach(card => {
        card.style.order = String(visibleOrder.has(card) ? visibleOrder.get(card) : cards.length + originalOrder.get(card));
      });
      const count = visible.length;
      const noun = config.itemLabel;
      results.textContent = count + " matching " + noun + (count === 1 ? "" : "s") +
        " · " + cards.length + " currently published in your university.";
    };
    controls.search.addEventListener("input", apply);
    controls.category.addEventListener("change", apply);
    controls.sort.addEventListener("change", apply);
    if (controls.availability) controls.availability.addEventListener("change", apply);
    reset.addEventListener("click", () => {
      controls.search.value = "";
      controls.category.value = "all";
      controls.sort.value = config.defaultSort;
      if (controls.availability) controls.availability.value = "available";
      apply();
      controls.search.focus();
    });
    const observer = new MutationObserver(apply);
    observer.observe(feed, {childList:true, subtree:true});
    apply();
    return {apply, observer};
  }
  buildControls({
    feedId:"campus-marketplace-feed", statusId:"campus-marketplace-status",
    searchId:"campus-marketplace-search", categoryId:"campus-marketplace-category-filter",
    availabilityId:"campus-marketplace-status-filter", sortId:"campus-marketplace-sort",
    resultsId:"campus-marketplace-results", ariaLabel:"Marketplace search and filters",
    searchLabel:"Search listings", placeholder:"Search books, electronics, services…",
    itemLabel:"listing", defaultSort:"newest",
    categories:[
      {value:"all",label:"All categories"},{value:"books",label:"Textbooks / study materials"},
      {value:"electronics",label:"Electronics"},{value:"accommodation",label:"Accommodation"},
      {value:"services",label:"Student services"},{value:"clothing",label:"Clothing"},
      {value:"furniture",label:"Furniture"},{value:"other",label:"Other"}
    ],
    availability:[{value:"available",label:"Available first"},{value:"all",label:"Available & sold"},{value:"sold",label:"Sold only"}],
    sort:[{value:"newest",label:"Newest first"},{value:"price-low",label:"Price: low to high"},{value:"price-high",label:"Price: high to low"}]
  });
  buildControls({
    feedId:"campus-opportunities-feed", statusId:"campus-opportunities-status",
    searchId:"campus-opportunities-search", categoryId:"campus-opportunities-category-filter",
    sortId:"campus-opportunities-sort", resultsId:"campus-opportunities-results",
    ariaLabel:"Opportunity Hub search and filters", searchLabel:"Search opportunities",
    placeholder:"Search scholarships, internships, grants…", itemLabel:"opportunity",
    defaultSort:"deadline",
    categories:[
      {value:"all",label:"All categories"},{value:"scholarship",label:"Scholarships"},
      {value:"internship",label:"Internships"},{value:"grant",label:"Grants"},
      {value:"competition",label:"Competitions"},{value:"hackathon",label:"Hackathons"},
      {value:"mentorship",label:"Mentorship"},{value:"gift",label:"Gifts / free offers"},
      {value:"free_item",label:"Free items"},{value:"student_support",label:"Student support"},
      {value:"other",label:"Other"}
    ],
    sort:[
      {value:"deadline",label:"Closing soon"},{value:"newest",label:"Recently added"},
      {value:"alphabetical",label:"Title A–Z"}
    ]
  });
})();