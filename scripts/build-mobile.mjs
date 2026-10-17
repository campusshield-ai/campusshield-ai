import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
const stagingRef = 'hywcpnoqqhxvujnimhxl';

const configPath = path.join(root, 'supabase-config.js');
const configText = await readFile(configPath, 'utf8');

if (!configText.includes(stagingRef)) {
  throw new Error(
    'Mobile build blocked: supabase-config.js does not point to the approved staging project. ' +
    'Do not build a release from production configuration.'
  );
}
if (/service_role|secret[_-]?key/i.test(configText)) {
  throw new Error('Mobile build blocked: a secret-like credential marker was detected in browser config.');
}

const requiredFiles = [
  'index.html',
  'supabase-config.js',
  'campusshield-backend.js',
  'manifest.webmanifest',
  'offline.html'
];

for (const file of requiredFiles) {
  const filePath = path.join(root, file);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Mobile build blocked: required file is missing: ${file}`);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of requiredFiles) {
  await cp(path.join(root, file), path.join(out, file));
}

const iconsPath = path.join(root, 'icons');
const iconsInfo = await stat(iconsPath).catch(() => null);
if (!iconsInfo?.isDirectory()) {
  throw new Error('Mobile build blocked: icons/ directory is missing.');
}
await cp(iconsPath, path.join(out, 'icons'), { recursive: true });

const builtConfig = await readFile(path.join(out, 'supabase-config.js'), 'utf8');
if (!builtConfig.includes(stagingRef)) {
  throw new Error('Mobile build blocked: output config is not staging.');
}

console.log('CampusShield AI mobile web assets prepared for staging.');
console.log('Supabase target: staging only.');
console.log('No database migration, deployment, merge, or store publication was performed.');
