/* Progressive layout behavior for CampusShield Private Messages.
   Existing message, request, privacy and voice-note handlers stay in campusshield-app.js. */
(() => {
  "use strict";

  const page = document.getElementById("page-campus-messages");
  if (!page) return;

  const layout = page.querySelector(".campus-dm-layout");
  const newPanel = page.querySelector(".campus-dm-new");
  const newBody = page.querySelector("#campus-dm-new-body");
  const newToggle = page.querySelector("#campus-dm-new-toggle");
  const searchInput = page.querySelector("#campus-dm-search");
  const backButton = page.querySelector("#campus-dm-mobile-back");
  const threadActive = page.querySelector("#campus-dm-thread-active");

  if (!layout || !newPanel || !newBody || !newToggle) return;

  let hasOpenThread = false;
  const isSinglePane = () => window.matchMedia("(max-width: 900px)").matches;

  function setNewMessageOpen(open, focusSearch) {
    newPanel.classList.toggle("is-open", open);
    newBody.hidden = !open;
    newToggle.setAttribute("aria-expanded", String(open));
    newToggle.querySelector("[data-toggle-label]")?.replaceChildren(
      document.createTextNode(open ? "Close" : "Compose")
    );
    if (open && focusSearch) {
      requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
    }
  }

  function showThread() {
    hasOpenThread = true;
    if (!isSinglePane()) return;
    layout.classList.add("is-thread-open");
    requestAnimationFrame(() => backButton?.focus({ preventScroll: true }));
  }

  function showInbox() {
    hasOpenThread = false;
    layout.classList.remove("is-thread-open");
    requestAnimationFrame(() => {
      page.querySelector(".campus-dm-conversation.active")?.focus({ preventScroll: true });
    });
  }

  newToggle.addEventListener("click", () => {
    const opening = newBody.hidden;
    setNewMessageOpen(opening, opening);
  });

  page.querySelector("#campus-dm-empty-start")?.addEventListener("click", () => {
    setNewMessageOpen(true, true);
  });

  backButton?.addEventListener("click", showInbox);

  page.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const conversation = target.closest(".campus-dm-conversation");
    if (conversation) showThread();
  });

  if (threadActive) {
    const threadObserver = new MutationObserver(() => {
      if (!threadActive.hidden) showThread();
    });
    threadObserver.observe(threadActive, { attributes: true, attributeFilter: ["hidden"] });
  }

  const pageObserver = new MutationObserver(() => {
    if (page.classList.contains("active")) {
      if (threadActive && !threadActive.hidden) showThread();
    } else {
      hasOpenThread = false;
      layout.classList.remove("is-thread-open");
      setNewMessageOpen(false, false);
    }
  });
  pageObserver.observe(page, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("resize", () => {
    if (isSinglePane() && hasOpenThread) {
      layout.classList.add("is-thread-open");
    } else {
      layout.classList.remove("is-thread-open");
    }
  }, { passive: true });
})();
