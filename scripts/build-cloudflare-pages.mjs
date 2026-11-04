#!/usr/bin/env node
/**
 * Build a public-only static payload for the isolated TORIO/CampusShield
 * Cloudflare Pages staging project.
 *
 * This intentionally excludes repository-only content such as Supabase
 * migrations/functions, tests, documentation, CI files, and helper scripts.
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "dist", "torio-staging");
const rootFileExtensions = new Set([".html", ".js", ".css", ".webmanifest"]);
const assetExtensions = new Set([
  ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf"
]);
const publicDirectories = ["assets", "icons"];
const requiredFiles = [
  "index.html",
  "torio-command-center.html",
  "torio-manifest.webmanifest",
  "manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "supabase-config.js",
  "campusshield-backend.js"
];

async function copyPublicAssets(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to package symbolic link: ${path.relative(repoRoot, source)}`);
    }
    if (entry.isDirectory()) {
      await copyPublicAssets(source, target);
    } else if (entry.isFile() && assetExtensions.has(path.extname(entry.name).toLowerCase())) {
      await cp(source, target);
    }
  }
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of await readdir(repoRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !rootFileExtensions.has(path.extname(entry.name).toLowerCase())) continue;
  await cp(path.join(repoRoot, entry.name), path.join(outputDir, entry.name));
}

for (const directory of publicDirectories) {
  const source = path.join(repoRoot, directory);
  try {
    if ((await stat(source)).isDirectory()) {
      await copyPublicAssets(source, path.join(outputDir, directory));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

for (const file of requiredFiles) {
  try {
    await stat(path.join(outputDir, file));
  } catch {
    throw new Error(`Required public site file missing from staging payload: ${file}`);
  }
}

for (const forbidden of [".github", "supabase", "tests", "docs", "scripts", "README.md"]) {
  try {
    await stat(path.join(outputDir, forbidden));
    throw new Error(`Repository-only path leaked into the public payload: ${forbidden}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

console.log(`Cloudflare Pages staging payload ready: ${path.relative(repoRoot, outputDir)}`);
console.log("Includes: root HTML/CSS/JS/webmanifest files and public assets/icons.");
console.log("Excludes: .github, supabase, tests, docs, scripts, and repository metadata.");
