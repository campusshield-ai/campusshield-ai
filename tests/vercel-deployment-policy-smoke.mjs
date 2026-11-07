import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const deploymentEnabled = config.git?.deploymentEnabled;

assert.ok(deploymentEnabled && typeof deploymentEnabled === "object",
  "Vercel branch deployment controls must be configured as a branch map");
assert.equal(deploymentEnabled["**"], false,
  "Unlisted feature branches must not create automatic Vercel deployments");
assert.equal(deploymentEnabled.main, true,
  "The main branch must remain enabled for Production deployments");
assert.equal(deploymentEnabled["staging/preview"], true,
  "The staging/preview branch must remain enabled for shared review deployments");

const explicitlyEnabledBranches = Object.entries(deploymentEnabled)
  .filter(([branch, enabled]) => branch !== "**" && enabled === true)
  .map(([branch]) => branch)
  .sort();

assert.deepEqual(explicitlyEnabledBranches, ["main", "staging/preview"],
  "Only main and staging/preview may be explicitly enabled");

console.log("Vercel deployment policy checks passed.");
