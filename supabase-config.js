/*
 * CampusShield AI — browser-safe Supabase environment selection.
 * GitHub Pages production stays on production. Localhost, file previews and other
 * development hosts use staging. These are publishable browser keys, not secrets.
 * Authorization must always be enforced by Supabase RLS and guarded RPCs.
 */
(() => {
  const productionHosts = new Set(["campusshield-ai.github.io"]);
  const isProductionHost = productionHosts.has(String(window.location.hostname || "").toLowerCase());

  const production = {
    url: "https://fvgtnujjnvdkhzqqcaqe.supabase.co",
    publishableKey: "sb_publishable_IDVCTiln0UBuyi_riZ-CJw__i84wmor"
  };
  const staging = {
    url: "https://hywcpnoqqhxvujnimhxl.supabase.co",
    publishableKey: "sb_publishable_qxFnFGkyBzVvvzQ3oFsyLw_tK6HCKOP"
  };

  window.CAMPUSSHIELD_SUPABASE_CONFIG = isProductionHost ? production : staging;
  console.info("CampusShield Supabase environment:", isProductionHost ? "production" : "staging/development");
})();
