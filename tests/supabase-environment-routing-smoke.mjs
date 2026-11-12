import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../supabase-config.js", import.meta.url), "utf8");
const environments = [
  ["campusshield-ai.github.io", "https://fvgtnujjnvdkhzqqcaqe.supabase.co"],
  ["campusshieldai.com", "https://fvgtnujjnvdkhzqqcaqe.supabase.co"],
  ["www.campusshieldai.com", "https://fvgtnujjnvdkhzqqcaqe.supabase.co"],
  ["campusshield-ai-staging-preview.vercel.app", "https://hywcpnoqqhxvujnimhxl.supabase.co"],
  ["campusshield-ai-staging-p-git-branch.vercel.app", "https://hywcpnoqqhxvujnimhxl.supabase.co"],
  ["localhost", "https://hywcpnoqqhxvujnimhxl.supabase.co"]
];

for (const [hostname, expectedUrl] of environments) {
  const window = { location: { hostname } };
  vm.runInNewContext(source, { window, console: { info() {} } });
  assert.equal(
    window.CAMPUSSHIELD_SUPABASE_CONFIG.url,
    expectedUrl,
    `Unexpected Supabase environment for host ${hostname}`
  );
}

console.log("Supabase environment routing checks passed.");
