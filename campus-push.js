(() => {
  "use strict";

  const API = "campus-push-subscriptions";
  const byId = (id) => document.getElementById(id);
  let currentUserId = null;
  let busy = false;

  function addPanel() {
    if (byId("campus-push-panel")) return byId("campus-push-panel");
    const alerts = byId("profile-settings-alerts")?.closest("section");
    if (!alerts) return null;

    const style = document.createElement("style");
    style.textContent = `
      .campus-push-panel{margin-top:1rem}
      .campus-push-panel .campus-push-actions{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:.8rem}
      .campus-push-panel .campus-push-status{margin:.45rem 0 0;line-height:1.5}
      .campus-push-panel [hidden]{display:none!important}
    `;
    document.head.appendChild(style);

    const panel = document.createElement("section");
    panel.id = "campus-push-panel";
    panel.className = "panel campus-push-panel";
    panel.setAttribute("aria-labelledby", "campus-push-title");
    panel.innerHTML = `
      <div class="panel-heading">
        <div><p class="profile-overline">BACKGROUND UPDATES</p><h2 id="campus-push-title">Push notifications</h2>
        <p>Receive CampusShield alerts when the app is closed. You can turn this off at any time.</p></div>
      </div>
      <p class="campus-push-status" id="campus-push-status" role="status" aria-live="polite">Checking notification support…</p>
      <div class="campus-push-actions">
        <button class="btn" id="campus-push-enable" type="button">Enable background alerts</button>
        <button class="btn secondary" id="campus-push-disable" type="button" hidden>Turn off background alerts</button>
      </div>`;
    alerts.insertAdjacentElement("afterend", panel);
    byId("campus-push-enable").addEventListener("click", enable);
    byId("campus-push-disable").addEventListener("click", disable);
    return panel;
  }

  function status(message) {
    const node = byId("campus-push-status");
    if (node) node.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    const enableButton = byId("campus-push-enable");
    const disableButton = byId("campus-push-disable");
    if (enableButton) enableButton.disabled = value;
    if (disableButton) disableButton.disabled = value;
  }

  function b64UrlToBytes(value) {
    const normal = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normal + "=".repeat((4 - normal.length % 4) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function invoke(action, extra = {}) {
    const backend = window.CampusShieldBackend;
    if (!backend?.client) throw new Error("CampusShield is not connected to Supabase.");
    const { data, error } = await backend.client.functions.invoke(API, { body: { action, ...extra } });
    if (error) throw new Error(error.message || "Could not update push notification settings.");
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function currentSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function refresh() {
    addPanel();
    if (!byId("campus-push-panel")) return;
    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      status("Background push is not supported in this browser or requires a secure HTTPS app.");
      byId("campus-push-enable").hidden = true;
      byId("campus-push-disable").hidden = true;
      return;
    }
    const backend = window.CampusShieldBackend;
    if (!backend?.client) {
      status("Supabase is not configured. Sign in after the app connection is restored.");
      return;
    }
    const { data: sessionData } = await backend.client.auth.getSession();
    const user = sessionData?.session?.user || null;
    currentUserId = user?.id || null;
    if (!user) {
      status("Sign in to manage your background alerts.");
      byId("campus-push-enable").hidden = true;
      byId("campus-push-disable").hidden = true;
      return;
    }
    byId("campus-push-enable").hidden = false;
    try {
      const config = await invoke("status");
      const localSubscription = await currentSubscription();
      const subscribed = Boolean(config.subscribed && localSubscription);
      byId("campus-push-enable").hidden = subscribed;
      byId("campus-push-disable").hidden = !subscribed;
      if (!config.configured) {
        status("The staging push sender is not configured yet. An administrator must add the VAPID keys in Supabase before you can enable background alerts.");
      } else if (Notification.permission === "denied") {
        status("Notifications are blocked by your browser. Allow notifications for this site in browser settings, then try again.");
      } else if (subscribed) {
        status("Background alerts are enabled for this account on this browser.");
      } else if (localSubscription && !config.subscribed) {
        status("This browser has a push subscription not linked to this account. Switch to the account that enabled it before turning it off.");
        byId("campus-push-enable").hidden = true;
      } else {
        status("Background alerts are off. Enable them to receive supported CampusShield notifications when the app is closed.");
      }
    } catch (error) {
      status(error?.message || "Could not load push notification settings. Check the staging preview origin and Supabase configuration.");
      byId("campus-push-disable").hidden = true;
    }
  }

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const backend = window.CampusShieldBackend;
      const { data: sessionData } = await backend.client.auth.getSession();
      if (!sessionData?.session?.user?.id || sessionData.session.user.id !== currentUserId) {
        throw new Error("Your session changed. Refresh your profile settings and try again.");
      }
      const config = await invoke("config");
      if (!config.configured || !config.publicKey) throw new Error("Background push is not configured yet. The VAPID public key is missing from staging.");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64UrlToBytes(config.publicKey)
        });
      }
      await invoke("subscribe", { subscription: subscription.toJSON() });
      status("Background alerts enabled on this browser.");
      await refresh();
    } catch (error) {
      status(error?.message || "Could not enable background alerts. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await invoke("unsubscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      status("Background alerts have been turned off on this browser.");
      await refresh();
    } catch (error) {
      status(error?.message || "Could not turn off background alerts. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function init() {
    addPanel();
    const client = window.CampusShieldBackend?.client;
    if (client?.auth) {
      client.auth.onAuthStateChange(() => { window.setTimeout(() => refresh().catch(() => {}), 0); });
    }
    refresh().catch((error) => status(error?.message || "Could not initialize push settings."));
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest?.('[data-page="profile-settings"]')) window.setTimeout(() => refresh().catch(() => {}), 50);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
