import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "torio-command-center.html");
const html = await readFile(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());

if (scripts.length === 0) {
  throw new Error("TORIO command center has no inline JavaScript to validate.");
}

scripts.forEach((source, index) => {
  new vm.Script(source, { filename: "torio-command-center.inline-" + (index + 1) + ".js" });
});

if (/async\s+async\s+function/.test(html)) {
  throw new Error("Duplicate async function declaration found in TORIO source.");
}

console.log("TORIO inline JavaScript syntax valid (" + scripts.length + " script block).");
