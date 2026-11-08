/*
 * CampusShield AI — browser-safe Supabase environment selection.
 * Explicit production hostnames use the Production project. All unrecognized
 * hosts, including unique Vercel previews and local development, use Staging.
 * These are publishable browser keys, not secrets; authorization stays in RLS.
 */
(() => {
  const productionHosts = new Set([
    "campusshield-ai.github.io",
  ]);
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
