/*
 * CampusShield AI — STAGING-ONLY browser test configuration.
 * This file belongs only on staging/browser-test-environment.
 * Never cherry-pick this config into production or main.
 * Uses a public publishable key; never put a secret/service_role key here.
 */
(() => {
  const stagingUrl = "https://hywcpnoqqhxvujnimhxl.supabase.co";
  const stagingProjectRef = "hywcpnoqqhxvujnimhxl";
  const publishableKey = "sb_publishable_qxFnFGkyBzVvvzQ3oFsyLw_tK6HCKOP";

  if (new URL(stagingUrl).hostname !== `${stagingProjectRef}.supabase.co`) {
    throw new Error("CampusShield staging project URL/ref mismatch.");
  }
  if (stagingProjectRef === "fvgtnujjnvdkhzqqcaqe" ||
      stagingUrl.includes("fvgtnujjnvdkhzqqcaqe")) {
    throw new Error("Blocked: production Supabase is forbidden in staging tests.");
  }
  if (!publishableKey.startsWith("sb_publishable_") ||
      /service_role|secret/i.test(publishableKey)) {
    throw new Error("Blocked: staging browser config must use a publishable key.");
  }

  window.CAMPUSSHIELD_SUPABASE_CONFIG = {
    url: stagingUrl,
    publishableKey
  };
  window.CAMPUSSHIELD_TEST_ENVIRONMENT = "staging";
})();
