/*
 * MapLibre GL JS v6 is distributed as an ES module. Load it here, expose the
 * namespace expected by the existing CampusMap module, then import CampusMap.
 * Loading is deliberately dependency-ordered so CampusMap never initializes
 * before MapLibre is ready.
 */
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
import './campus-map-config.js';

window.maplibregl = maplibregl;
await import('./campus-map.js');
