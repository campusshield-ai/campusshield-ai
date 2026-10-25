(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const nav = $("admin-rewards-nav");
  const page = $("page-admin-rewards");
  const status = $("admin-rewards-status");
  const rows = $("admin-rewards-rows");
  let busy = false;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = error ? "error" : "ok";
  }
  function cell(value) {
    const node = document.createElement("td");
    node.textContent = value == null || value === "" ? "—" : String(value);
    return node;
  }
  function render(payload) {
    const students = Array.isArray(payload?.students) ? payload.students : [];
    $("admin-rewards-student-count").textContent = Number(payload?.student_count || 0).toLocaleString();
    $("admin-rewards-points-total").textContent = Number(payload?.points_total || 0).toLocaleString();
    $("admin-rewards-badge-total").textContent = Number(payload?.badges_total || 0).toLocaleString();
    $("admin-rewards-completed-total").textContent = Number(payload?.challenges_completed_total || 0).toLocaleString();
    rows.replaceChildren();
    if (!students.length) {
      const tr = document.createElement("tr");
      const td = cell("No student reward records yet.");
      td.colSpan = 5;
      tr.append(td);
      rows.append(tr);
      return;
    }
    students.forEach((student) => {
      const tr = document.createElement("tr");
      tr.append(cell(student.display_name), cell(Number(student.total_points || 0).toLocaleString()),
        cell(Number(student.badges_earned || 0).toLocaleString()),
        cell(Number(student.challenges_completed || 0).toLocaleString()),
        cell(student.last_points_awarded ? new Date(student.last_points_awarded).toLocaleString() : "—"));
      rows.append(tr);
    });
  }
  async function load() {
    if (busy) return;
    busy = true;
    const backend = window.CampusShieldBackend;
    if (!backend?.client) {
      setStatus("Supabase is not configured.", true);
      busy = false;
      return;
    }
    const refresh = $("admin-rewards-refresh");
    if (refresh) refresh.disabled = true;
    setStatus("Verifying administrator access…");
    try {
      const { data: authData, error: authError } = await backend.client.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sign in to continue.");
      const { data: profile, error: profileError } = await backend.client.from("profiles")
        .select("role,verification_status").eq("id", authData.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "admin" || profile?.verification_status !== "verified") {
        nav.hidden = true;
        page.hidden = true;
        throw new Error("This overview is restricted to verified administrators.");
      }
      const { data, error } = await backend.client.rpc("get_admin_student_rewards");
      if (error) throw error;
      nav.hidden = false;
      page.hidden = false;
      render(data || {});
      setStatus("Administrator access verified. Showing rewards across all students.");
    } catch (error) {
      rows.replaceChildren();
      const tr = document.createElement("tr");
      const td = cell(error?.message || "Could not load rewards.");
      td.colSpan = 5;
      tr.append(td);
      rows.append(tr);
      setStatus(error?.message || "Could not load rewards.", true);
    } finally {
      busy = false;
      if (refresh) refresh.disabled = false;
    }
  }
  function syncNav() {
    const backend = window.CampusShieldBackend;
    if (!backend?.client) return;
    backend.client.auth.getUser().then(async ({data, error}) => {
      if (error || !data?.user) { nav.hidden = true; return; }
      const {data: profile, error: profileError} = await backend.client.from("profiles")
        .select("role,verification_status").eq("id", data.user.id).maybeSingle();
      nav.hidden = Boolean(profileError || profile?.role !== "admin" || profile?.verification_status !== "verified");
    }).catch(() => { nav.hidden = true; });
  }
  $("admin-rewards-refresh")?.addEventListener("click", load);
  nav?.addEventListener("click", () => { void load(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNav(); });
  if (window.CampusShieldBackend?.client) {
    window.CampusShieldBackend.client.auth.onAuthStateChange(() => { window.setTimeout(syncNav, 0); });
    syncNav();
  } else {
    window.addEventListener("load", syncNav, {once:true});
  }
})();