import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const htmlPath = resolve("index.html");
const html = await readFile(htmlPath, "utf8");
const config = await readFile("supabase-config.js", "utf8");
const backend = await readFile("campusshield-backend.js", "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((source) => source.trim());

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(source), "inline script " + (index + 1) + " parses");
}
assert.doesNotThrow(() => new Function(config), "Supabase config parses");
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");
assert.match(config, /hywcpnoqqhxvujnimhxl/);
assert.doesNotMatch(config, /fvgtnujjnvdkhzqqcaqe/);
assert.match(html, /id="workspace-sidebar"/);
assert.match(html, /id="sidebar-toggle"/);
assert.match(html, /id="sidebar-backdrop"/);
assert.match(html, /event\.key === 'Escape'/);
assert.match(html, /body\.sidebar-open \.sidebar/);
assert.match(html, /Only verified administrators can access account approvals\./);
assert.match(html, /does not contact emergency services/i);

const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find((name) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0);
assert.ok(chrome, "Chrome/Chromium is installed for browser interaction checks");
const port = 9333;
const browser = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=" + port,
  "--user-data-dir=" + resolve(".staging-chrome-profile"), "about:blank"
], { stdio: "ignore" });

let socket;
try {
  let version;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await delay(250);
  }
  assert.ok(version?.webSocketDebuggerUrl, "Chrome DevTools endpoint starts");

  const targetResponse = await fetch("http://127.0.0.1:" + port + "/json/new?" + encodeURIComponent(pathToFileURL(htmlPath).href), { method: "PUT" });
  assert.ok(targetResponse.ok, "Chrome opens the staging HTML file");
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  function cdp(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result?.value;
  }
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if (await evaluate("document.readyState === 'complete'")) break;
    } catch {}
    await delay(250);
  }
  await delay(500);
  await evaluate("document.getElementById('workspace').hidden = false; document.getElementById('login-screen').hidden = true; true");

  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(150);
  assert.equal(await evaluate("getComputedStyle(document.getElementById('sidebar-toggle')).display !== 'none'"), true, "mobile menu toggle is visible");
  assert.equal(await evaluate("document.body.classList.contains('sidebar-open')"), false, "mobile navigation starts closed");
  await evaluate("document.getElementById('sidebar-toggle').click()");
  assert.equal(await evaluate("document.body.classList.contains('sidebar-open')"), true, "menu button opens the drawer");
  assert.equal(await evaluate("document.getElementById('sidebar-toggle').getAttribute('aria-expanded')"), "true", "expanded state is accessible");
  await evaluate("document.getElementById('sidebar-backdrop').click()");
  assert.equal(await evaluate("document.body.classList.contains('sidebar-open')"), false, "backdrop closes the drawer");
  await evaluate("document.getElementById('sidebar-toggle').click(); document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
  assert.equal(await evaluate("document.body.classList.contains('sidebar-open')"), false, "Escape closes the drawer");
  await evaluate("document.getElementById('sidebar-toggle').click(); document.querySelector('[data-page=\"report\"]').click()");
  assert.equal(await evaluate("document.body.classList.contains('sidebar-open')"), false, "selecting a page closes the drawer");

  await cdp("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(150);
  assert.equal(await evaluate("getComputedStyle(document.getElementById('sidebar-toggle')).display === 'none'"), true, "desktop menu toggle is hidden");
  assert.equal(await evaluate("document.querySelector('.main').getBoundingClientRect().left > 0"), true, "desktop workspace keeps its sidebar offset");

  console.log("PASS: inline JavaScript syntax, staging-only config, mobile drawer open/close, accessible expanded state, Escape, navigation close, and desktop layout.");
} finally {
  try { socket?.close(); } catch {}
  browser.kill("SIGTERM");
}
