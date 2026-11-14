/* CampusShield AI — My Campus Studio. Preferences are visual only and never grant access. */
(() => {
  "use strict";

  const root = document.documentElement;
  const page = document.getElementById("page-campus-studio");
  if (!page) return;

  const $ = id => document.getElementById(id);
  const DEFAULTS = Object.freeze({
    palette: "emerald",
    wallpaper: "clean",
    icons: "standard",
    layout: "standard",
    font: "system",
    frame: "none"
  });

  const OPTION_RANKS = Object.freeze({
    palette: { emerald: 0, ocean: 1, violet: 1, rose: 2, sunset: 2, monochrome: 3, gold: 4 },
    wallpaper: { clean: 0, aurora: 2, night: 2, grid: 2, sunset: 3, midnight: 4 },
    icons: { standard: 0, rounded: 2, minimal: 2, duotone: 3, bold: 4 },
    layout: { standard: 0, compact: 3, spacious: 3, focus: 4 },
    font: { system: 0, rounded: 4, serif: 4 },
    frame: { none: 0, soft: 2, glow: 4 }
  });

  const PLAN_RANK = Object.freeze({
    starter: 1,
    plus: 2,
    elite: 3,
    pro: 4,
    ultra: 4,
    max: 4,
    premium: 1
  });

  const PLAN_LABELS = Object.freeze({
    free: "Campus Free",
    starter: "Campus Starter",
    plus: "Campus Plus",
    elite: "Campus Elite",
    pro: "Campus Ultimate",
    ultra: "Legacy Ultra",
    max: "Legacy Max",
    premium: "Legacy Premium"
  });

  let currentUser = null;
  let currentPlan = "free";
  let currentRank = 0;
  let preferences = { ...DEFAULTS };
  let loading = false;

  function localKey(userId) {
    return "campusshield_studio_" + String(userId || "guest");
  }

  function readLocal(userId) {
    try {
      const value = JSON.parse(localStorage.getItem(localKey(userId)) || "null");
      return value && typeof value === "object" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocal(userId, value) {
    try {
      localStorage.setItem(localKey(userId), JSON.stringify(value));
    } catch (_) {
      // Preferences still apply for the current session if local storage is unavailable.
    }
  }

  function normalise(input, rank) {
    const output = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      const value = input && typeof input[key] === "string" ? input[key] : DEFAULTS[key];
      const requiredRank = OPTION_RANKS[key][value];
      if (Number.isInteger(requiredRank) && requiredRank <= rank) output[key] = value;
    }
    return output;
  }

  function applyPreferences() {
    root.dataset.campusPalette = preferences.palette;
    root.dataset.campusWallpaper = preferences.wallpaper;
    root.dataset.campusIcons = preferences.icons;
    root.dataset.campusLayout = preferences.layout;
    root.dataset.campusFont = preferences.font;
    root.dataset.campusFrame = preferences.frame;

    const preview = $("campus-studio-preview");
    if (preview) {
      preview.dataset.palette = preferences.palette;
      const title = $("campus-studio-preview-theme");
      if (title) title.textContent = preferences.palette[0].toUpperCase() + preferences.palette.slice(1) + " campus";
    }
  }

  function renderPlan() {
    const name = $("campus-studio-plan-name");
    const note = $("campus-studio-plan-note");
    const dot = $("campus-studio-plan-dot");
    if (name) name.textContent = PLAN_LABELS[currentPlan] || "Campus Free";
    if (note) {
      note.textContent = currentRank > 0
        ? "Personalisation unlocked by your active " + (PLAN_LABELS[currentPlan] || "paid") + " plan."
        : "You're on the free campus experience. Core university and safety tools stay available.";
    }
    if (dot) dot.style.background = currentRank > 0 ? "var(--campus-accent,#16856d)" : "#8a9893";

    for (const [key, ranks] of Object.entries(OPTION_RANKS)) {
      const select = $("campus-studio-" + key);
      if (!select) continue;
      for (const option of Array.from(select.options)) {
        const value = option.value;
        const required = Number.isInteger(ranks[value]) ? ranks[value] : 99;
        option.disabled = required > currentRank;
        option.textContent = option.dataset.label || option.textContent.replace(/ · .*$/, "");
        if (required > 0) option.dataset.label = option.textContent;
      }
      select.value = preferences[key];
      select.disabled = loading;
    }

    const save = $("campus-studio-save");
    if (save) save.disabled = loading || !currentUser || currentRank === 0;
    const reset = $("campus-studio-reset");
    if (reset) reset.disabled = loading;
  }

  function setStatus(message, isError) {
    const status = $("campus-studio-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? "error" : "normal";
  }

  function setEntitlement(plan, expiresAt) {
    const active = Boolean(
      plan &&
      Object.prototype.hasOwnProperty.call(PLAN_RANK, plan) &&
      expiresAt &&
      Date.parse(expiresAt) > Date.now()
    );
    currentPlan = active ? plan : "free";
    currentRank = active ? PLAN_RANK[plan] : 0;
    const next = normalise(preferences, currentRank);
    const changed = JSON.stringify(next) !== JSON.stringify(preferences);
    preferences = next;
    applyPreferences();
    renderPlan();
    if (changed) writeLocal(currentUser?.id, preferences);
  }

  async function getClientAndUser() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !backend?.client) {
      throw new Error("The secure CampusShield service is not available. Please reload and sign in again.");
    }
    const { data, error } = await backend.client.auth.getUser();
    if (error || !data?.user) throw new Error("Sign in to save your personal Campus Studio settings.");
    return { client: backend.client, user: data.user };
  }

  async function load() {
    if (loading) return;
    loading = true;
    renderPlan();
    setStatus("Loading your personal studio settings…", false);
    try {
      const { client, user } = await getClientAndUser();
      currentUser = user;

      const remotePrefs = user.user_metadata?.campusshield_studio;
      const localPrefs = readLocal(user.id);
      preferences = normalise(
        remotePrefs && typeof remotePrefs === "object" ? remotePrefs : (localPrefs || DEFAULTS),
        0
      );

      const { data: subscription, error: subscriptionError } = await client
        .from("shieldmind_subscriptions")
        .select("plan,status,expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (subscriptionError) {
        currentPlan = "free";
        currentRank = 0;
        setStatus("Your subscription could not be verified. Studio upgrades remain locked until the secure check succeeds.", true);
      } else {
        const active = Boolean(
          subscription &&
          subscription.status === "active" &&
          subscription.expires_at &&
          Date.parse(subscription.expires_at) > Date.now()
        );
        setEntitlement(active ? subscription.plan : "free", active ? subscription.expires_at : null);
        setStatus(
          currentRank > 0
            ? "Your plan is verified. Try a style, then save it to your account."
            : "Preview the standard look. Upgrade to Campus Starter or above to unlock premium colours and Studio options.",
          false
        );
      }

      const remote = user.user_metadata?.campusshield_studio;
      if (remote && typeof remote === "object") {
        preferences = normalise(remote, currentRank);
      } else {
        preferences = normalise(localPrefs || DEFAULTS, currentRank);
      }
      applyPreferences();
      renderPlan();
      page.dataset.loaded = "true";
    } catch (error) {
      currentUser = null;
      currentPlan = "free";
      currentRank = 0;
      preferences = { ...DEFAULTS };
      applyPreferences();
      renderPlan();
      setStatus(error?.message || "Your Studio settings could not be loaded.", true);
    } finally {
      loading = false;
      renderPlan();
    }
  }

  function previewChange(event) {
    const select = event.target.closest("select[id^='campus-studio-']");
    if (!select) return;
    const key = select.id.replace("campus-studio-", "");
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    const allowed = OPTION_RANKS[key]?.[select.value];
    if (!Number.isInteger(allowed) || allowed > currentRank) {
      select.value = preferences[key];
      setStatus("That Studio option belongs to a higher subscription tier.", true);
      return;
    }
    preferences[key] = select.value;
    applyPreferences();
    writeLocal(currentUser?.id, preferences);
    setStatus("Preview updated. Select Save changes to sync this look to your account.", false);
  }

  async function save() {
    if (!currentUser || currentRank === 0) {
      setStatus("An active Campus Starter, Plus, Elite or Ultimate subscription is required to save premium Studio settings.", true);
      return;
    }
    const button = $("campus-studio-save");
    if (button) {
      button.disabled = true;
      button.textContent = "Saving…";
    }
    setStatus("Saving your personal Studio settings securely…", false);
    try {
      const { client, user } = await getClientAndUser();
      if (user.id !== currentUser.id) throw new Error("Your sign-in changed. Reload the Studio before saving.");
      const next = normalise(preferences, currentRank);
      const metadata = Object.assign({}, user.user_metadata || {}, { campusshield_studio: next });
      const { data, error } = await client.auth.updateUser({ data: metadata });
      if (error) throw error;
      currentUser = data?.user || user;
      preferences = next;
      writeLocal(user.id, preferences);
      applyPreferences();
      setStatus("Saved to your CampusShield account. Your look will follow you on this signed-in account.", false);
    } catch (error) {
      writeLocal(currentUser.id, preferences);
      setStatus((error?.message || "Could not sync your Studio settings.") + " Your preview is still saved on this device.", true);
    } finally {
      if (button) button.textContent = "Save changes";
      renderPlan();
    }
  }

  function reset() {
    preferences = normalise(DEFAULTS, currentRank);
    applyPreferences();
    renderPlan();
    writeLocal(currentUser?.id, preferences);
    setStatus("Studio preview reset to your plan's default style. Save changes to sync it.", false);
  }

  page.addEventListener("change", previewChange);
  $("campus-studio-save")?.addEventListener("click", save);
  $("campus-studio-reset")?.addEventListener("click", reset);

  document.addEventListener("campusshield:shieldmind-access", event => {
    const state = event.detail || {};
    if (!currentUser) return;
    setEntitlement(state.active ? state.plan : "free", state.active ? state.expiresAt : null);
  });

  window.CampusShieldStudio = { load, reset, getPreferences: () => ({ ...preferences }) };
  applyPreferences();
})();