/*
 * CampusMap is a secondary workspace. Keep its large renderer, map-only CSS,
 * and OSM geometry helpers out of the first dashboard load. The first time the
 * user opens CampusMap, load its dependencies in order and initialize it.
 */
(() => {
  'use strict';

  const root = document.getElementById('page-campus-map');
  if (!root) return;

  const stylePromises = new Map();
  let geometryPromise = null;
  let mapLoadPromise = null;

  function loadStylesheet(key, href) {
    if (stylePromises.has(key)) return stylePromises.get(key);

    const promise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.campusshieldLazyMapStyle = key;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        stylePromises.delete(key);
        reject(new Error('CampusMap stylesheet could not be loaded: ' + key));
      };
      document.head.appendChild(link);
    });

    stylePromises.set(key, promise);
    return promise;
  }

  function loadGeometryHelpers() {
    if (window.CampusMapGeometry) return Promise.resolve();
    if (geometryPromise) return geometryPromise;

    geometryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./campus-map-geometry.js', import.meta.url).href;
      script.async = true;
      script.onload = () => window.CampusMapGeometry
        ? resolve()
        : reject(new Error('CampusMap geometry helpers did not initialize.'));
      script.onerror = () => {
        script.remove();
        geometryPromise = null;
        reject(new Error('CampusMap geometry helpers could not be loaded.'));
      };
      document.head.appendChild(script);
    });

    return geometryPromise;
  }

  async function loadCampusMap() {
    await Promise.all([
      loadStylesheet('maplibre', 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css'),
      loadStylesheet('campus-map', './campus-map.css?v=20261113-1'),
      loadStylesheet('campus-map-passport', './campus-map-passport.css?v=20261113-1')
    ]);

    await import('./campus-map-config.js');
    await loadGeometryHelpers();

    const maplibregl = await import('https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs');
    window.maplibregl = maplibregl;
    await import('./campus-map.js');

    // CampusMap may already be the active route by the time its modules finish
    // loading. The map module's observer is installed after that route change,
    // so initialize explicitly rather than waiting for another navigation.
    if (root.classList.contains('active')) {
      window.CampusShieldCampusMap?.initialize?.();
    }
  }

  function startWhenVisible() {
    if (!root.classList.contains('active') || mapLoadPromise) return;
    mapLoadPromise = loadCampusMap().catch(error => {
      mapLoadPromise = null;
      console.error('CampusMap could not load its map library.', error);
      const status = document.getElementById('campus-map-status');
      if (status) {
        status.textContent = 'The map service could not be loaded. Check your connection and reopen Campus Map to retry.';
        status.dataset.kind = 'warning';
      }
    });
  }

  const observer = new MutationObserver(startWhenVisible);
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'hidden'] });
  startWhenVisible();
})();
