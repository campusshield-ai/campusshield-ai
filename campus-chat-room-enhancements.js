(() => {
  "use strict";

  const page = document.getElementById("page-campus-chat");
  if (!page) return;

  const list = page.querySelector("#campus-chat-messages");
  const search = page.querySelector("#campus-chat-search");
  const searchStatus = page.querySelector("#campus-chat-search-status");
  const refresh = page.querySelector("#campus-chat-refresh");
  const jumpLatest = page.querySelector("#campus-chat-jump-latest");
  const input = page.querySelector("#campus-chat-input");
  const form = page.querySelector("#campus-chat-form");
  const count = page.querySelector("#campus-chat-char-count");
  const activeChannel = page.querySelector("#campus-chat-active-channel");
  const channelDescription = page.querySelector("#campus-chat-channel-description");

  if (!list || !search || !input || !form) return;

  const channelCopy = {
    general: ["General", "Campus-wide questions, updates and conversations."],
    study_help: ["Study Help", "Ask academic questions, share revision tips and help classmates learn."],
    campus_life: ["Campus Life", "Talk about student life, clubs, events and campus experiences."],
    marketplace: ["Marketplace", "Share useful listings and discover student-to-student offers."]
  };

  function updateChannelContext(channel) {
    const copy = channelCopy[channel] || channelCopy.general;
    if (activeChannel) activeChannel.textContent = copy[0];
    if (channelDescription) channelDescription.textContent = copy[1];
  }

  page.querySelectorAll("[data-chat-channel]").forEach((button) => {
    button.addEventListener("click", () => updateChannelContext(button.dataset.chatChannel));
  });

  refresh?.addEventListener("click", () => {
    const selected = page.querySelector('[data-chat-channel][aria-selected="true"]');
    if (selected) selected.click();
  });

  let noResults = null;
  function getNoResultsNode() {
    if (noResults && noResults.isConnected) return noResults;
    noResults = document.createElement("div");
    noResults.className = "campus-chat-search-empty";
    noResults.dataset.chatNoResults = "true";
    const title = document.createElement("strong");
    title.textContent = "No matching messages";
    const detail = document.createElement("span");
    detail.textContent = "Try another word or username.";
    noResults.append(title, detail);
    return noResults;
  }

  function applySearch() {
    const term = String(search.value || "").trim().toLocaleLowerCase();
    const cards = Array.from(list.querySelectorAll(".campus-chat-message"));
    let visible = 0;
    cards.forEach((card) => {
      const haystack = String(card.dataset.search || card.textContent || "").toLocaleLowerCase();
      const matches = !term || haystack.includes(term);
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    const dividers = Array.from(list.querySelectorAll(".campus-chat-day-divider"));
    dividers.forEach((divider) => {
      let next = divider.nextElementSibling;
      let hasVisibleMessage = false;
      while (next && !next.classList.contains("campus-chat-day-divider")) {
        if (next.classList.contains("campus-chat-message") && !next.hidden) hasVisibleMessage = true;
        next = next.nextElementSibling;
      }
      divider.hidden = !hasVisibleMessage;
    });

    const empty = getNoResultsNode();
    if (term && cards.length && visible === 0) {
      if (!empty.isConnected) list.appendChild(empty);
      empty.hidden = false;
    } else if (empty.isConnected) {
      empty.remove();
    }

    if (searchStatus) {
      searchStatus.textContent = term
        ? "Showing " + visible + " of " + cards.length + " loaded messages"
        : cards.length + " recent message" + (cards.length === 1 ? "" : "s") + " loaded";
    }
  }

  search.addEventListener("input", applySearch);

  function updateCharacterCount() {
    const length = String(input.value || "").length;
    if (!count) return;
    count.textContent = length.toLocaleString() + " / 1,200";
    count.classList.toggle("is-near-limit", length >= 1050 && length <= 1200);
    count.classList.toggle("is-over-limit", length > 1200);
  }
  input.addEventListener("input", updateCharacterCount);
  updateCharacterCount();

  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      if (!input.disabled && !page.querySelector("#campus-chat-send")?.disabled) {
        form.requestSubmit();
      }
    }
  });

  function hideJumpButton() {
    if (jumpLatest) jumpLatest.hidden = true;
  }
  jumpLatest?.addEventListener("click", () => {
    list.scrollTo({
      top: list.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
    hideJumpButton();
  });

  list.addEventListener("scroll", () => {
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 90) hideJumpButton();
  }, { passive: true });

  document.addEventListener("campus-chat:rendered", (event) => {
    applySearch();
    const newCount = Number(event.detail?.newMessageCount || 0);
    const atBottom = event.detail?.atBottom === true;
    if (atBottom || newCount <= 0) {
      hideJumpButton();
      return;
    }
    if (jumpLatest) {
      jumpLatest.textContent = "↓ " + newCount + " new message" + (newCount === 1 ? "" : "s");
      jumpLatest.hidden = false;
    }
  });

  updateChannelContext("general");
})();
