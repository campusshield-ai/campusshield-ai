/* Pure geometry helpers for OpenStreetMap campus building imports. */
(function attachCampusMapGeometry(root) {
  'use strict';

  function parseOsmLength(value) {
    if (value == null || value === '') return null;
    const match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|meter|meters|metre|metres|ft|feet)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return /^(ft|feet)$/i.test(match[2] || '') ? amount * 0.3048 : amount;
  }

  function parseOsmLevels(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    if (!/^\d{1,3}$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 200 ? parsed : null;
  }

  // Calculate an area-weighted polygon centroid in a local equirectangular
  // projection. The map is campus-local, so using the mean latitude for the
  // longitude scale avoids the vertex-density bias of a simple coordinate mean.
  function ringCentroid(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const openRing = ring.slice(0, -1);
    if (openRing.length < 3) return null;
    const meanLatitude = openRing.reduce((sum, point) => sum + point[1], 0) / openRing.length;
    const longitudeScale = Math.cos(meanLatitude * Math.PI / 180);
    if (!Number.isFinite(longitudeScale) || Math.abs(longitudeScale) < 1e-6) return null;

    let twiceArea = 0;
    let centroidXNumerator = 0;
    let centroidYNumerator = 0;
    for (let index = 0; index < openRing.length; index += 1) {
      const current = openRing[index];
      const next = openRing[(index + 1) % openRing.length];
      const x1 = current[0] * longitudeScale;
      const y1 = current[1];
      const x2 = next[0] * longitudeScale;
      const y2 = next[1];
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      centroidXNumerator += (x1 + x2) * cross;
      centroidYNumerator += (y1 + y2) * cross;
    }
    if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 1e-12) return null;
    const x = centroidXNumerator / (3 * twiceArea);
    const latitude = centroidYNumerator / (3 * twiceArea);
    const longitude = x / longitudeScale;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return [longitude, latitude];
  }

  function osmWayToBuildingCandidate(way) {
    if (!way || typeof way !== 'object' || !/^\d{1,20}$/.test(String(way.id || ''))) return null;
    const tags = way.tags && typeof way.tags === 'object' ? way.tags : {};
    const buildingTag = String(tags.building || '').trim().toLowerCase();
    if (!buildingTag || ['no', 'false', '0'].includes(buildingTag)) return null;
    if (!Array.isArray(way.geometry) || way.geometry.length < 4 || way.geometry.length > 2000) return null;

    const ring = [];
    for (const point of way.geometry) {
      if (!point || typeof point !== 'object'
          || point.lat == null || point.lon == null
          || String(point.lat).trim() === '' || String(point.lon).trim() === '') return null;
      const latitude = Number(point.lat);
      const longitude = Number(point.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
      ring.push([longitude, latitude]);
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    if (ring.length < 4 || ring.length > 2001) return null;

    const unique = new Set(ring.slice(0, -1).map(point => point[0].toFixed(10) + ',' + point[1].toFixed(10)));
    if (unique.size < 3) return null;
    const center = ringCentroid(ring);
    if (!center) return null;

    const height = parseOsmLength(tags.height);
    const minHeight = parseOsmLength(tags.min_height);
    const levels = parseOsmLevels(tags['building:levels'] ?? tags.levels);
    if (height != null && minHeight != null && minHeight >= height) return null;

    return {
      source_feature_id: String(way.id),
      name: tags.name || tags['name:en'] || null,
      building_class: buildingTag || 'yes',
      geometry_geojson: { type: 'Polygon', coordinates: [ring] },
      center_latitude: center[1],
      center_longitude: center[0],
      height_m: height,
      min_height_m: minHeight,
      levels,
      roof_shape: tags['roof:shape'] || null,
      roof_material: tags['roof:material'] || null,
      roof_colour: tags['roof:colour'] || null,
      facade_material: tags['building:material'] || tags.material || null,
      facade_colour: tags['building:colour'] || tags.colour || null,
      source_url: 'https://www.openstreetmap.org/way/' + way.id,
      height_method: height != null ? 'tagged' : levels != null ? 'estimated_from_levels' : 'visual_fallback_only',
      source_tags: tags
    };
  }

  root.CampusMapGeometry = Object.freeze({
    parseOsmLength,
    parseOsmLevels,
    ringCentroid,
    osmWayToBuildingCandidate
  });
})(typeof window !== 'undefined' ? window : globalThis);
