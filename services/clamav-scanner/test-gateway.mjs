import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";

const TOKEN = "campusshield-test-token-not-for-production";
const EICAR = String.raw`X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return port;
}

function startMockClamd(port) {
  const server = net.createServer((socket) => {
    let buffered = Buffer.alloc(0);
    let payload = Buffer.alloc(0);
    let started = false;
    socket.on("data", (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (!started) {
        const marker = Buffer.from("zINSTREAM\\0", "utf8");
        const index = buffered.indexOf(marker);
        if (index < 0) return;
        buffered = buffered.subarray(index + marker.length);
        started = true;
      }
      while (buffered.length >= 4) {
        const size = buffered.readUInt32BE(0);
        if (buffered.length < 4 + size) return;
        buffered = buffered.subarray(4);
        if (size === 0) {
          const response = payload.includes(Buffer.from(EICAR, "ascii"))
            ? "stream: Eicar-Test-Signature FOUND\\0"
            : "stream: OK\\0";
          socket.end(response);
          return;
        }
        payload = Buffer.concat([payload, buffered.subarray(0, size)]);
        buffered = buffered.subarray(size);
      }
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}

async function waitForHealth(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error("Scanner gateway exited before becoming healthy.");
    try {
      const response = await fetch(url + "/health");
      if (response.ok) return;
    } catch { /* wait for the local test server to start */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Scanner gateway did not start within 8 seconds.");
}

async function runGatewayTest({ mockMode = "normal" } = {}) {
  const apiPort = await freePort();
  const clamdPort = await freePort();
  const mock = mockMode === "unavailable" ? null : startMockClamd(clamdPort);
  if (mockMode === "unavailable") {
    // Reserve then release a port to ensure no ClamAV listener is present.
    const reservation = net.createServer();
    reservation.listen(clamdPort, "127.0.0.1");
    await once(reservation, "listening");
    await new Promise((resolve, reject) => reservation.close((err) => err ? reject(err) : resolve()));
  }
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(apiPort), CLAMD_HOST: "127.0.0.1", CLAMD_PORT: String(clamdPort), MALWARE_SCANNER_TOKEN: TOKEN },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const base = "http://127.0.0.1:" + apiPort;
  try {
    await waitForHealth(base, child);
    const cleanBytes = Buffer.from("%PDF-1.7\\nCampusShield synthetic clean test document\\n%%EOF\\n", "ascii");
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const post = (bytes, options = {}) => fetch(base + "/scan", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + TOKEN,
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "X-File-SHA256": hash(bytes),
        ...options,
      },
      body: bytes,
    });

    const unauthorized = await post(cleanBytes, { Authorization: "Bearer wrong-token" });
    assert.equal(unauthorized.status, 401, "wrong bearer token must be rejected");

    const unsupported = await post(cleanBytes, { "Content-Type": "application/octet-stream" });
    assert.equal(unsupported.status, 415, "unsupported MIME must be rejected");

    const cleanResponse = await post(cleanBytes);
    assert.equal(cleanResponse.status, mockMode === "unavailable" ? 503 : 200);
    if (mockMode !== "unavailable") {
      const cleanResult = await cleanResponse.json();
      assert.equal(cleanResult.status, "clean", "synthetic clean PDF should return clean from mock ClamAV");
      assert.equal(cleanResult.sha256, hash(cleanBytes), "scanner response must echo exact SHA-256");
      const infectedBytes = Buffer.from("%PDF-1.7\\n" + EICAR + "\\n%%EOF\\n", "ascii");
      const infectedResponse = await post(infectedBytes);
      assert.equal(infectedResponse.status, 200);
      const infectedResult = await infectedResponse.json();
      assert.equal(infectedResult.status, "infected", "EICAR test signature must be flagged by mock scanner");
      assert.equal(infectedResult.sha256, hash(infectedBytes));
      const mismatch = await post(cleanBytes, { "X-File-SHA256": "0".repeat(64) });
      assert.equal(mismatch.status, 400, "incorrect SHA-256 must be rejected");
    } else {
      const failure = await cleanResponse.json();
      assert.equal(failure.error, "scanner_unavailable", "scanner outage must fail closed");
    }
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1500))]);
    if (mock) await new Promise((resolve) => mock.close(() => resolve()));
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

await runGatewayTest();
await runGatewayTest({ mockMode: "unavailable" });
console.log("ClamAV gateway synthetic integration tests passed (mock ClamAV only; no live malware scan performed).");
