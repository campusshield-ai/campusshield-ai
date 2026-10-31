/*
 * MapLibre GL JS v6 is distributed as an ES module. Load it here, expose the
 * namespace expected by the existing CampusMap module, then import CampusMap.
 * The dynamic imports let the loader show a useful fallback if a CDN request fails.
 */
import './campus-map-config.js';

try {
  const maplibregl = await import('https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs');
  window.maplibregl = maplibregl;
  await import('./campus-map.js');
} catch (error) {
  console.error('CampusMap could not load its map library.', error);
  const status = document.getElementById('campus-map-status');
  if (status) {
    status.textContent = 'The map service could not be loaded. Check your connection and reload the Campus Map.';
    status.dataset.kind = 'warning';
  }
}
