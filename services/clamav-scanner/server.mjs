import http from "node:http";
import net from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.MALWARE_SCANNER_TOKEN || "";
const CLAMD_HOST = process.env.CLAMD_HOST || "clamav";
const CLAMD_PORT = Number(process.env.CLAMD_PORT || 3310);
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
function tokenMatches(value) {
  if (!TOKEN || !value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(TOKEN);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function hasValidSignature(bytes, mime) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "application/pdf") return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}
function scanWithClamAV(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    const chunks = [];
    let finished = false;
    const fail = (err) => { if (!finished) { finished = true; socket.destroy(); reject(err); } };
    socket.setTimeout(20000, () => fail(new Error("clamav_timeout")));
    socket.on("error", fail);
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const response = Buffer.concat(chunks).toString("utf8");
      if (response.includes("\\0") || /(?:OK|FOUND|ERROR)\\s*$/.test(response)) {
        if (finished) return;
        finished = true;
        socket.end();
        const line = response.replace(/\\0/g, "").trim();
        if (/\\bFOUND$/.test(line)) resolve({ status: "infected", signature: line.slice(0, 180) });
        else if (/\\bOK$/.test(line)) resolve({ status: "clean" });
        else reject(new Error("clamav_scan_error"));
      }
    });
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\\0", "utf8"));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk terminates INSTREAM
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { status: "ok", scanner: "clamav" });
  if (req.method !== "POST" || req.url !== "/scan") return send(res, 404, { error: "not_found" });
  if (!tokenMatches(req.headers.authorization)) return send(res, 401, { error: "unauthorized" });
  const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.has(mime)) return send(res, 415, { error: "unsupported_file_type" });
  const declared = Number(req.headers["content-length"] || 0);
  if (!Number.isFinite(declared) || declared < 1 || declared > MAX_BYTES) return send(res, 413, { error: "invalid_file_size" });
  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) { req.destroy(); return; }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.length || bytes.length !== declared || !hasValidSignature(bytes, mime)) return send(res, 415, { error: "file_signature_mismatch" });
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    const claimedHash = String(req.headers["x-file-sha256"] || "");
    if (claimedHash && !/^[a-f0-9]{64}$/i.test(claimedHash)) return send(res, 400, { error: "invalid_hash" });
    const result = await scanWithClamAV(bytes);
    // Return only the clean/infected decision; do not expose signatures or raw scanner output.
    return send(res, 200, { status: result.status, sha256: actualHash });
  } catch {
    return send(res, 503, { error: "scanner_unavailable" });
  }
});
server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.listen(PORT, "0.0.0.0", () => console.log("ClamAV scanner gateway listening on", PORT));
