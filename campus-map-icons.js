/*
 * CampusShield's original, local SVG symbol set for verified campus map points.
 * The SVGs contain no external resources and do not represent surveyed geometry.
 */
(() => {
  'use strict';

  const definitions = {
    security: { color: '#c93f57', mark: '<path d="M16 5.2 24 8v6.2c0 5.1-3.3 9.4-8 12.2-4.7-2.8-8-7.1-8-12.2V8l8-2.8Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="m12.2 15.6 2.5 2.5 5.2-5.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    medical: { color: '#c77b20', mark: '<path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff"/>' },
    library: { color: '#246d99', mark: '<path d="M7.5 9.2c3-1.1 5.9-.7 8.5 1.1 2.6-1.8 5.5-2.2 8.5-1.1v13c-3-1.1-5.9-.7-8.5 1.1-2.6-1.8-5.5-2.2-8.5-1.1z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 10.5v12.2M10.5 12.5c1.5-.3 2.6 0 3.6.7m7.4-.7c-1.5-.3-2.6 0-3.6.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' },
    hostel: { color: '#7659aa', mark: '<path d="m5.8 15.1 10.2-8 10.2 8v10.1H5.8z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M13 25.2v-7h6v7M10 15.6h2m8 0h2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' },
    cafeteria: { color: '#a96b2b', mark: '<path d="M8 12h15l-1.5 12h-12z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M23 14h1.2a3 3 0 0 1 0 6H22M11 8c-1.2-1.4 1.1-1.8 0-3m5 3c-1.2-1.4 1.1-1.8 0-3m5 3c-1.2-1.4 1.1-1.8 0-3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>' },
    lecture_hall: { color: '#3b679d', mark: '<path d="m4.8 12.2 11.2-5 11.2 5L16 17.1z" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/><path d="M9.2 14.2v5.2c4.3 3.1 9.3 3.1 13.6 0v-5.2M27.2 12.5v7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="27.2" cy="21" r="1.5" fill="#fff"/>' },
    building: { color: '#477e73', mark: '<path d="M8 26V7h11v19M19 13h5v13M11 11h2m3 0h-2m-3 5h2m3 0h-2m-3 5h2m3 0h-2m5-4h2m-2 4h2M14 26v-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    gate: { color: '#287f78', mark: '<path d="M6 26V9h20v17M11 26V9m10 17V9M6 13h20M6 19h20" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' },
    entrance: { color: '#117a86', mark: '<path d="M8 26V7h10v19M13 16h12m-5-5 5 5-5 5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    parking: { color: '#52677d', mark: '<path d="M10 26V6h7.3a6 6 0 0 1 0 12H10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' },
    sports: { color: '#47824e', mark: '<circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" stroke-width="1.8"/><path d="m11.8 6.5 4.2 4 5.2-.3m4.3 5.8-5.1 2.4-1.6 5.1m-7.3.7-.7-5.6-4.8-2.6m3.8-6.7 2.4 4.7-2.1 4.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
    assembly_point: { color: '#bd7830', mark: '<circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16" cy="16" r="2" fill="#fff"/>' },
    accessible_entry: { color: '#16845a', mark: '<circle cx="12.1" cy="8.3" r="2.1" fill="#fff"/><path d="m12 12.2-1.3 6.2 5.5 1.1 2.5 5.1m-8-6.2-3.3 5.2m4.6-5.2 5.7-.5m-4.7-5.7 5.6 1.1 2 4.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.2" cy="22.7" r="4.2" fill="none" stroke="#fff" stroke-width="1.7"/>' },
    emergency_point: { color: '#b93e37', mark: '<path d="M16 6 27 25H5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M16 12v6.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="22" r="1.2" fill="#fff"/>' },
    location: { color: '#168a73', mark: '<path d="M16 27s-8.5-8.2-8.5-14.1a8.5 8.5 0 1 1 17 0C24.5 18.8 16 27 16 27Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="12.8" r="2.8" fill="none" stroke="#fff" stroke-width="1.8"/>' }
  };

  function svg(type) {
    const definition = definitions[type] || definitions.location;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32" role="img" aria-hidden="true">' +
      '<circle cx="16" cy="16" r="14.1" fill="' + definition.color + '" stroke="#fff" stroke-width="1.8"/>' +
      definition.mark + '</svg>';
  }

  async function addToMap(map) {
    if (!map || typeof Image !== 'function' || typeof map.addImage !== 'function') return [];
    const loaded = [];
    await Promise.all(Object.keys(definitions).map(type => new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const id = 'campus-feature-' + type;
          if (!map.hasImage || !map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
          loaded.push(type);
        } catch (_) {
          // Keep the original colour-circle markers when a browser rejects an image.
        }
        resolve();
      };
      image.onerror = () => resolve();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(type));
    })));
    return loaded;
  }

  window.CampusMapIcons = Object.freeze({
    types: Object.freeze(Object.keys(definitions)),
    svg,
    addToMap
  });
})();
