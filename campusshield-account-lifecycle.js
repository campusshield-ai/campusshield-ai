(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const backend = () => window.CampusShieldBackend;
  const PROFILE_PAGE = "page-profile-settings";
  const ADMIN_PAGE = "page-platform-admin";

  async function invoke(action, extra = {}) {
    const api = backend();
    if (!api?.client) throw new Error("CampusShield is not connected to its secure account service.");
    const { data, error } = await api.client.functions.invoke("account-lifecycle", {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message || "Account lifecycle request failed.");
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value ?? "");
  }

  function formatDate(value) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Not scheduled";
    return date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  function daysRemaining(value) {
    const deadline = new Date(value).getTime();
    if (!Number.isFinite(deadline)) return null;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));
  }

  function isPageActive(id) {
    return $(id)?.classList.contains("active") === true;
  }

  async function refreshProfileLifecycle() {
    const api = backend();
    const panel = $("account-lifecycle-panel");
    if (!panel || !api?.client) return;

    const button = $("account-lifecycle-deactivate");
    const status = $("account-lifecycle-status");
    const deadline = $("account-lifecycle-deadline");
    const help = $("account-lifecycle-help");

    try {
      const { data: authData, error: authError } = await api.client.auth.getUser();
      if (authError || !authData?.user) throw new Error("Sign in again to check your account status.");

      const userId = authData.user.id;
      const [{ data: profile, error: profileError }, isPlatformAdmin] = await Promise.all([
        api.client.from("profiles").select("role").eq("id", userId).maybeSingle(),
        api.isPlatformAdmin().catch(() => false),
      ]);
      if (profileError) throw profileError;

      const protectedAccount = profile?.role === "admin" || isPlatformAdmin === true;
      if (protectedAccount) {
        if (button) button.hidden = true;
        if (status) status.textContent = "Administrator account protected";
        if (deadline) deadline.textContent = "Platform administrator accounts cannot be deactivated from this page.";
        if (help) help.textContent = "This protection prevents the platform from being left without a trusted administrator.";
        return;
      }

      const data = await invoke("status");
      if (data.status === "deactivated" || data.status === "purge_blocked") {
        if (button) button.hidden = true;
        if (status) status.textContent = data.status === "purge_blocked" ? "Deletion awaiting review" : "Deactivation pending";
        const remaining = daysRemaining(data.purge_after);
        if (deadline) deadline.textContent = "Scheduled permanent deletion: " + formatDate(data.purge_after) +
          (remaining === null ? "" : " · " + remaining + " day(s) remaining");
        if (help) help.textContent = "Contact CampusShield support before the deadline to request reactivation.";
      } else {
        if (button) button.hidden = false;
        if (status) status.textContent = "Active";
        if (deadline) deadline.textContent = "No deletion is scheduled for this account.";
        if (help) help.textContent = "Deactivation blocks sign-in immediately. You have up to 90 days to request reactivation from CampusShield support. After the deadline, the account and its associated data are permanently removed, subject to required retention and deletion safeguards.";
      }
    } catch (error) {
      if (status) status.textContent = "Account status unavailable";
      if (deadline) deadline.textContent = error?.message || "Reload this page and try again.";
      if (button) button.disabled = true;
    }
  }

  async function deactivateMyAccount(button) {
    if (!confirm(
      "Deactivate your CampusShield account now?\n\n" +
      "• Sign-in will be blocked immediately.\n" +
      "• You can request reactivation within 90 days by contacting CampusShield support.\n" +
      "• After 90 days, the account and associated data will be permanently deleted, subject to required retention and deletion safeguards.\n\n" +
      "Continue with deactivation?"
    )) return;

    const api = backend();
    button.disabled = true;
    button.textContent = "Deactivating…";
    setText("account-lifecycle-status", "Submitting your deactivation request…");

    try {
      const result = await invoke("deactivate");
      setText("account-lifecycle-status", "Account deactivated");
      setText("account-lifecycle-deadline", "Scheduled permanent deletion: " + formatDate(result.purge_after));
      setText("account-lifecycle-help", "Your sign-in will now close. Contact support before the 90-day deadline if you need your account reactivated.");
      await api.client.auth.signOut({ scope: "local" }).catch(() => {});
      alert("Your account has been deactivated. The 90-day recovery period has started.");
      window.location.reload();
    } catch (error) {
      setText("account-lifecycle-status", "Deactivation was not completed");
      setText("account-lifecycle-deadline", error?.message || "Please try again or contact support.");
      button.disabled = false;
      button.textContent = "Deactivate my account";
    }
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = String(text ?? "—");
    return cell;
  }

  function renderDeactivatedAccounts(accounts) {
    const tbody = $("account-lifecycle-admin-rows");
    if (!tbody) return;
    tbody.replaceChildren();

    if (!accounts.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "There are no accounts in the 90-day recovery queue.";
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    for (const account of accounts) {
      const row = document.createElement("tr");
      const identity = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = account.display_name || account.email || "CampusShield account";
      const sub = document.createElement("small");
      sub.textContent = account.email || account.user_id;
      identity.append(title, document.createElement("br"), sub);
      const identityCell = document.createElement("td");
      identityCell.appendChild(identity);
      row.appendChild(identityCell);

      const state = account.status === "purge_blocked" ? "Deletion needs review" : "Deactivated";
      row.appendChild(createCell(state + (account.role ? " · " + account.role : "")));
      const remaining = daysRemaining(account.purge_after);
      row.appendChild(createCell(formatDate(account.purge_after) +
        (remaining === null ? "" : " · " + remaining + " day(s) left")));
      row.appendChild(createCell(account.legacy_soft_deleted
        ? "Legacy irreversible closure"
        : account.purge_attempts ? String(account.purge_attempts) + " attempt(s)" : "No purge attempts"));

      const actionCell = document.createElement("td");
      if (account.reactivation_available) {
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "btn secondary";
        restore.textContent = "Reactivate";
        restore.dataset.accountLifecycleRestore = account.user_id;
        actionCell.appendChild(restore);
      } else {
        const note = document.createElement("span");
        note.className = "account-lifecycle-legacy-note";
        note.textContent = account.legacy_soft_deleted
          ? "Cannot restore via Auth"
          : "Recovery window ended";
        actionCell.appendChild(note);
      }
      row.appendChild(actionCell);
      tbody.appendChild(row);
    }
  }

  async function refreshAdminLifecycle() {
    const message = $("account-lifecycle-admin-message");
    const button = $("account-lifecycle-admin-refresh");
    if (!message || !backend()?.client) return;
    if (button) button.disabled = true;
    message.textContent = "Loading deactivated accounts…";
    try {
      const result = await invoke("list-deactivated");
      renderDeactivatedAccounts(Array.isArray(result.accounts) ? result.accounts : []);
      message.textContent = (result.accounts || []).length
        ? "Deactivated accounts and their recovery deadlines."
        : "There are no accounts in the 90-day recovery queue.";
    } catch (error) {
      message.textContent = error?.message || "Account lifecycle queue could not be loaded.";
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function restoreAccount(userId, button) {
    if (!UUID_RE.test(userId)) return;
    if (!confirm("Reactivate this account now? The owner will be able to sign in with their existing credentials.")) return;
    button.disabled = true;
    button.textContent = "Restoring…";
    const message = $("account-lifecycle-admin-message");
    try {
      await invoke("restore", { user_id: userId });
      if (message) message.textContent = "Account reactivated. The owner can now sign in.";
      await refreshAdminLifecycle();
    } catch (error) {
      if (message) message.textContent = error?.message || "The account could not be reactivated.";
      button.disabled = false;
      button.textContent = "Reactivate";
    }
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function bind() {
    $("account-lifecycle-deactivate")?.addEventListener("click", (event) => {
      deactivateMyAccount(event.currentTarget);
    });
    $("account-lifecycle-admin-refresh")?.addEventListener("click", refreshAdminLifecycle);
    $("account-lifecycle-admin-rows")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-account-lifecycle-restore]");
      if (!button) return;
      restoreAccount(button.dataset.accountLifecycleRestore, button);
    });

    const observePage = (id, callback) => {
      const page = $(id);
      if (!page || typeof MutationObserver !== "function") return;
      const observer = new MutationObserver(() => {
        if (page.classList.contains("active")) callback();
      });
      observer.observe(page, { attributes: true, attributeFilter: ["class"] });
    };
    observePage(PROFILE_PAGE, refreshProfileLifecycle);
    observePage(ADMIN_PAGE, refreshAdminLifecycle);

    if (isPageActive(PROFILE_PAGE)) refreshProfileLifecycle();
    if (isPageActive(ADMIN_PAGE)) refreshAdminLifecycle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
