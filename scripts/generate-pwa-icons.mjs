import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "icons");
const background = [21, 128, 61, 255];
const shieldColor = [255, 255, 255, 255];
const checkColor = shieldColor;
const shieldOuter = [[256,92],[374,134],[374,232],[366,282],[344,338],[256,420],[168,338],[146,282],[138,232],[138,134]];
const shieldInner = [[256,124],[344,155],[344,231],[337,273],[318,319],[256,378],[194,319],[175,273],[168,231],[168,155]];
const check = [[197,247],[232,282],[316,198],[345,227],[232,340],[168,273]];
const sampleGrid = 4;

function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function makePng(size, scale) {
  const points = (polygon) => polygon.map(([x, y]) => [256 + (x - 256) * scale, 256 + (y - 256) * scale]);
  const scaledShieldOuter = points(shieldOuter);
  const scaledShieldInner = points(shieldInner);
  const scaledCheck = points(check);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const samples = sampleGrid * sampleGrid;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const counts = [0, 0, 0];
      for (let sy = 0; sy < sampleGrid; sy++) {
        for (let sx = 0; sx < sampleGrid; sx++) {
          const point = [(x + (sx + .5) / sampleGrid) * 512 / size, (y + (sy + .5) / sampleGrid) * 512 / size];
          if (contains(point, scaledCheck)) counts[2]++;
          else if (contains(point, scaledShieldOuter) && !contains(point, scaledShieldInner)) counts[1]++;
          else counts[0]++;
        }
      }
      const colors = [background, shieldColor, checkColor];
      const offset = rowOffset + 1 + x * 4;
      for (let channel = 0; channel < 4; channel++) {
        rows[offset + channel] = Math.round(counts.reduce((sum, count, index) => sum + count * colors[index][channel], 0) / samples);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(output, { recursive: true });
for (const [filename, size, scale] of [
  ["apple-touch-icon.png", 180, 1],
  ["campusshield-192.png", 192, 1],
  ["campusshield-512.png", 512, 1],
  ["campusshield-maskable-512.png", 512, .78],
]) {
  await writeFile(join(output, filename), makePng(size, scale));
}
console.log("Generated CampusShield PWA icons.");
