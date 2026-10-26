(() => {
  "use strict";

  const root = document.getElementById("campus-service-directory-panel");
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const searchInput = $("campus-service-directory-search");
  const ownershipFilter = $("campus-service-directory-ownership");
  const matchesEl = $("campus-service-directory-matches");
  const statusEl = $("campus-service-directory-status");
  const countEl = $("campus-service-directory-count");
  const detailsEl = $("campus-service-directory-details");

  let universities = [];
  let servicesById = new Map();
  let selectedId = "";
  let pendingId = "";
  let visibleCount = 20;
  let loading = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function sourceDirectoryUrl(university, serviceRow) {
    if (serviceRow && safeHttpUrl(serviceRow.source_directory_url)) {
      return safeHttpUrl(serviceRow.source_directory_url);
    }
    if (university.ownership === "Federal") return "https://www.nuc.edu.ng/federal-univeristies/";
    if (university.ownership === "State") return "https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/";
    return "https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/";
  }

  function sourceStatusLabel(university, serviceRow) {
    const home = safeHttpUrl(university.official_website);
    const status = serviceRow?.data_status || (home ? "official_homepage_only" : "nuc_listing_only");
    if (status === "official_office_pages_verified") return "Official office source links available";
    if (home) return "Official university website recorded";
    return "NUC listing available; official website not yet recorded";
  }

  function renderMatches() {
    if (!matchesEl || !statusEl) return;
    const query = String(searchInput?.value || "").trim().toLocaleLowerCase();
    const ownership = String(ownershipFilter?.value || "");
    const filtered = universities.filter(function (university) {
      const matchesQuery = !query ||
        String(university.name || "").toLocaleLowerCase().includes(query) ||
        String(university.state || "").toLocaleLowerCase().includes(query) ||
        String(university.ownership || "").toLocaleLowerCase().includes(query);
      const matchesOwnership = !ownership || university.ownership === ownership;
      return matchesQuery && matchesOwnership;
    });

    const visible = filtered.slice(0, visibleCount);
    if (!filtered.length) {
      matchesEl.innerHTML = '<p class="empty campus-service-directory-empty">No universities match that search. Try a shorter name or a state.</p>';
      statusEl.textContent = "No matches found.";
      return;
    }

    matchesEl.innerHTML = visible.map(function (university) {
      const serviceRow = servicesById.get(university.id) || {};
      const site = safeHttpUrl(university.official_website);
      const mainLink = site || sourceDirectoryUrl(university, serviceRow);
      const mainLabel = site ? "Official website" : "NUC listing";
      const selected = selectedId === university.id ? " is-selected" : "";
      return '<article class="campus-service-directory-result' + selected + '">' +
        '<div class="campus-service-directory-result-copy">' +
          '<h3>' + escapeHtml(university.name) + '</h3>' +
          '<p>' + escapeHtml(university.state || "State not recorded") + ' · ' +
            escapeHtml(university.ownership || "Ownership not recorded") + '</p>' +
          '<small>' + escapeHtml(sourceStatusLabel(university, serviceRow)) + '</small>' +
        '</div>' +
        '<div class="campus-service-directory-result-actions">' +
          '<a class="btn secondary" href="' + escapeHtml(mainLink) + '" target="_blank" rel="noopener noreferrer">' + mainLabel + '</a>' +
          '<button class="btn" type="button" data-service-directory-select="' + escapeHtml(university.id) + '">View services</button>' +
        '</div>' +
      '</article>';
    }).join("");

    if (filtered.length > visible.length) {
      matchesEl.insertAdjacentHTML("beforeend",
        '<div class="campus-service-directory-more-wrap"><button id="campus-service-directory-more" type="button" class="btn secondary">Show more universities (' +
        String(filtered.length - visible.length) + ' remaining)</button></div>');
    }

    statusEl.textContent = "Showing " + visible.length + " of " + filtered.length + " matching universities (" + universities.length + " active in the directory).";
  }

  function sourceLink(url, label) {
    const safe = safeHttpUrl(url);
    if (!safe) return "";
    return '<a class="btn secondary" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(label) + '</a>';
  }

  function serviceCard(university, row, definition) {
    const officeUrl = safeHttpUrl(row?.[definition.urlField]);
    const phone = String(row?.[definition.phoneField] || "").trim();
    const email = String(row?.[definition.emailField] || "").trim();
    const sourceUrl = safeHttpUrl(row?.[definition.sourceField]);
    const homeUrl = safeHttpUrl(university.official_website);
    const listingUrl = sourceDirectoryUrl(university, row);
    const fallbackUrl = homeUrl || listingUrl;
    const mainUrl = officeUrl || (sourceUrl && sourceUrl !== homeUrl ? sourceUrl : fallbackUrl);
    let mainLabel = "Open NUC listing";
    if (officeUrl) mainLabel = "Open official office page";
    else if (sourceUrl && sourceUrl !== homeUrl) mainLabel = "Open official source page";
    else if (homeUrl) mainLabel = "Open university website";

    let contact = "";
    if (phone) {
      contact += '<p class="campus-service-directory-contact"><strong>Phone:</strong> <span>' + escapeHtml(phone) + '</span></p>';
    }
    if (email) {
      const safeEmail = email.split(/[;,]/)[0].trim();
      contact += '<p class="campus-service-directory-contact"><strong>Email:</strong> <a href="mailto:' + escapeHtml(safeEmail) + '">' + escapeHtml(email) + '</a></p>';
    }

    let note = "";
    if (!officeUrl && !phone && !email) {
      note = '<p class="campus-service-directory-note">A separate office page or direct contact has not been verified in the directory yet. Use the institution website or the NUC listing for current details.</p>';
    } else if (!phone && !email) {
      note = '<p class="campus-service-directory-note">An official information page is linked, but a direct phone number or email is not recorded here.</p>';
    } else {
      note = '<p class="campus-service-directory-note">Contact information is recorded from an official university source. Check the source page for any updates.</p>';
    }

    let sources = "";
    if (sourceUrl && sourceUrl !== mainUrl) {
      sources = sourceLink(sourceUrl, "View source page");
    }
    if (homeUrl && homeUrl !== mainUrl && homeUrl !== sourceUrl) {
      sources += sourceLink(homeUrl, "Official university website");
    }

    return '<article class="campus-service-directory-office">' +
      '<span class="campus-contact-kicker">' + escapeHtml(definition.kicker) + '</span>' +
      '<h4>' + escapeHtml(definition.title) + '</h4>' +
      contact + note +
      '<div class="actions campus-service-directory-office-actions">' +
        (mainUrl ? sourceLink(mainUrl, mainLabel) : "") + sources +
      '</div>' +
    '</article>';
  }

  function renderDetails(id) {
    if (!detailsEl) return;
    const university = universities.find(function (item) { return item.id === id; });
    if (!university) {
      detailsEl.hidden = true;
      detailsEl.innerHTML = "";
      selectedId = "";
      renderMatches();
      return;
    }

    selectedId = id;
    const row = servicesById.get(id) || {};
    const website = safeHttpUrl(university.official_website);
    const directoryUrl = sourceDirectoryUrl(university, row);
    const mainUrl = website || directoryUrl;
    const mainLabel = website ? "Open official university website" : "Open NUC university listing";
    let state = escapeHtml(university.state || "State not recorded");
    let ownership = escapeHtml(university.ownership || "Ownership not recorded");

    detailsEl.innerHTML =
      '<div class="campus-service-directory-detail-heading">' +
        '<div><span class="campus-contact-kicker">SELECTED UNIVERSITY</span>' +
          '<h3>' + escapeHtml(university.name) + '</h3>' +
          '<p>' + state + ' · ' + ownership + '</p></div>' +
        '<div class="actions">' + sourceLink(mainUrl, mainLabel) +
          '<button type="button" class="btn secondary" id="campus-service-directory-clear">Clear selection</button></div>' +
      '</div>' +
      '<div class="campus-service-directory-offices">' +
        serviceCard(university, row, {kicker:"HEALTH & WELLBEING",title:"Campus medical services",urlField:"medical_services_url",phoneField:"medical_phone",emailField:"medical_email",sourceField:"medical_source_url"}) +
        serviceCard(university, row, {kicker:"STUDENT SERVICES",title:"Student affairs",urlField:"student_affairs_url",phoneField:"student_affairs_phone",emailField:"student_affairs_email",sourceField:"student_affairs_source_url"}) +
        serviceCard(university, row, {kicker:"ACADEMIC ADMINISTRATION",title:"Registrar / Registry",urlField:"registrar_url",phoneField:"registrar_phone",emailField:"registrar_email",sourceField:"registrar_source_url"}) +
      '</div>' +
      '<p class="campus-contacts-footnote">Information is populated only from official university pages or the National Universities Commission listing. A blank office contact means it has not been verified in this directory; it does not mean the university lacks that service.</p>';
    detailsEl.hidden = false;
    renderMatches();
  }

  async function loadDirectory() {
    if (loading || !root) return;
    loading = true;
    if (statusEl) statusEl.textContent = "Loading official university and service records…";
    const backend = window.CampusShieldBackend;
    try {
      if (!backend?.client) throw new Error("The campus directory is not connected.");
      const results = await Promise.all([
        backend.client.from("campus_universities")
          .select("id,name,slug,ownership,state,official_website")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500),
        backend.client.from("campus_university_service_directory")
          .select("university_id,medical_services_url,medical_phone,medical_email,medical_source_url,student_affairs_url,student_affairs_phone,student_affairs_email,student_affairs_source_url,registrar_url,registrar_phone,registrar_email,registrar_source_url,source_directory_url,data_status,last_verified_at")
          .limit(500)
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      universities = Array.isArray(results[0].data) ? results[0].data : [];
      servicesById = new Map((Array.isArray(results[1].data) ? results[1].data : [])
        .map(function (row) { return [row.university_id, row]; }));

      const ownership = ownershipFilter;
      if (ownership) {
        const options = ['<option value="">All ownership types</option>'];
        ["Federal", "State", "Private"].forEach(function (name) {
          options.push('<option value="' + name + '">' + name + ' universities</option>');
        });
        ownership.innerHTML = options.join("");
      }

      renderMatches();
      if (countEl) countEl.textContent = universities.length + " universities";
      if (pendingId) renderDetails(pendingId);
      if (statusEl) {
        statusEl.textContent = universities.length + " active universities loaded. Official office contacts are shown only where verified.";
      }
    } catch (error) {
      if (statusEl) statusEl.textContent = error?.message || "The university service directory could not be loaded right now.";
      matchesEl.innerHTML = '<p class="empty campus-service-directory-empty">Reload this page to try again. If the issue continues, use the official National Universities Commission listing.</p>';
    } finally {
      loading = false;
    }
  }

  function selectUniversity(id) {
    pendingId = String(id || "");
    if (universities.length && pendingId) renderDetails(pendingId);
  }

  if (searchInput) searchInput.addEventListener("input", function () {
    visibleCount = 20;
    renderMatches();
  });
  if (ownershipFilter) ownershipFilter.addEventListener("change", function () {
    visibleCount = 20;
    renderMatches();
  });

  root.addEventListener("click", function (event) {
    const selectButton = event.target.closest("[data-service-directory-select]");
    if (selectButton) {
      selectUniversity(selectButton.getAttribute("data-service-directory-select"));
      return;
    }
    if (event.target.closest("#campus-service-directory-more")) {
      visibleCount += 20;
      renderMatches();
      return;
    }
    if (event.target.closest("#campus-service-directory-clear")) {
      pendingId = "";
      renderDetails("");
    }
  });

  window.CampusShieldServiceDirectory = {
    load: loadDirectory,
    selectUniversity: selectUniversity
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDirectory, { once: true });
  } else {
    loadDirectory();
  }
})();