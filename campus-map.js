(() => {
  'use strict';
  const root = document.getElementById('page-campus-map');
  if (!root) return;

  const $ = id => document.getElementById(id);
  const status = $('campus-map-status');
  const search = $('campus-map-search');
  const results = $('campus-map-results');
  const mapHost = $('campus-map-canvas');
  const campusName = $('campus-map-campus-name');
  const featureList = $('campus-map-feature-list');
  const mapKey = 'campus-map';
  let map = null;
  let features = [];
  let allFeatures = [];
  let adminDrafts = [];
  let campus = null;
  let campusRole = null;
  let isVerifiedStaff = false;
  let isCampusAdmin = false;
  let incidentPins = [];
  let emergencyOnly = false;
  let incidentsVisible = false;
  let selectedFeature = null;
  let userMarker = null;
  let campusCenterMarker = null;
  let placementMarker = null;
  let placementMode = false;
  let mapMode = '2d';
  let resizeObserver = null;
  let resizeFrame = 0;
  let lastMapErrorAt = 0;
  let routeLayerAdded = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const client = () => window.CampusShieldBackend?.client || null;

  function setStatus(message, kind = 'info') {
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function mapStyle() {
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-base', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }]
    };
  }

  function ensureMap() {
    if (map || !window.maplibregl) return map;
    map = new maplibregl.Map({
      container: mapHost,
      style: mapStyle(),
      center: [3.7191259, 6.8910932],
      zoom: 5.2,
      pitch: 0,
      bearing: 0,
      maxPitch: 60,
      minZoom: 5,
      maxZoom: 19,
      pitchWithRotate: true,
      cooperativeGestures: true,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      map.addSource('campus-features', { type: 'geojson', data: featureCollection([]) });
      map.addLayer({
        id: 'campus-feature-points',
        type: 'circle',
        source: 'campus-features',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'feature_type'], 'security'], 9, 7],
          'circle-color': ['match', ['get', 'feature_type'],
            'security', '#d9485f', 'medical', '#dc8a28', 'library', '#256f9a',
            'hostel', '#8560bd', 'cafeteria', '#bd7b32', '#168a73'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
      map.addLayer({
        id: 'campus-feature-labels',
        type: 'symbol',
        source: 'campus-features',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: { 'text-color': '#15343a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
      });
      map.addSource('campus-drafts', {
        type: 'geojson',
        data: featureCollection([]),
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 44
      });
      map.addLayer({
        id: 'campus-draft-clusters',
        type: 'circle',
        source: 'campus-drafts',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 14, 5, 17, 10, 20],
          'circle-color': '#b97719',
          'circle-opacity': 0.94,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });
      map.addLayer({
        id: 'campus-draft-cluster-count',
        type: 'symbol',
        source: 'campus-drafts',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': '#fff' }
      });
      map.addLayer({
        id: 'campus-draft-points',
        type: 'circle',
        source: 'campus-drafts',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 5, 18, 7],
          'circle-color': '#d29332',
          'circle-opacity': 0.92,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff'
        }
      });
      map.addLayer({
        id: 'campus-draft-labels',
        type: 'symbol',
        source: 'campus-drafts',
        minzoom: 16,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16, 9, 19, 11],
          'text-offset': [0, 1.25],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-ignore-placement': false
        },
        paint: { 'text-color': '#563b14', 'text-halo-color': '#fff', 'text-halo-width': 1.7 }
      });

      // Esri World Imagery has much broader worldwide coverage at small/medium scales.
      // Babcock may not have high-detail tiles at every requested zoom. Cap the imagery
      // source at the globally covered baseline so MapLibre overzooms the last valid tile
      // instead of requesting close-up levels that render "Map data not yet available".
      // OSM building geometry below remains available at high zoom for the 3D overlay.
      map.addSource('campus-esri-imagery', {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: 'Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      });
      map.addLayer({
        id: 'campus-esri-imagery-layer',
        type: 'raster',
        source: 'campus-esri-imagery',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 250 }
      }, 'campus-feature-points');

      // OpenFreeMap vector tiles carry OpenMapTiles building features derived from OSM.
      // Height fields are mapped/estimated values; they are not campus survey measurements.
      map.addSource('campus-openfreemap-buildings', {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        maxzoom: 14,
        attribution: '© OpenFreeMap © OpenMapTiles · Data © OpenStreetMap contributors'
      });
      map.addLayer({
        id: 'campus-osm-3d-buildings',
        type: 'fill-extrusion',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'building',
        minzoom: 15,
        layout: { visibility: 'none' },
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': ['coalesce', ['get', 'colour'], '#d8c6a7'],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.5, ['coalesce', ['get', 'render_height'], 7]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-osm-3d-building-edges',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'building',
        minzoom: 16,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: { 'line-color': '#71644f', 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.35, 19, 0.8], 'line-opacity': 0.5 }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-osm-3d-poi-labels',
        type: 'symbol',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'poi',
        minzoom: 15,
        filter: ['all', ['has', 'name'], ['<=', ['get', 'rank'], 18]],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 9, 18, 11],
          'text-offset': [0, 0.8],
          'text-anchor': 'top',
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
          'text-allow-overlap': false
        },
        paint: { 'text-color': '#172f2b', 'text-halo-color': '#fff8e8', 'text-halo-width': 1.7 }
      }, 'campus-feature-points');
      $('campus-map-satellite')?.classList.add('available');

      map.addSource('campus-incidents', { type: 'geojson', data: featureCollection([]) });
      map.addLayer({
        id: 'campus-incident-points',
        type: 'circle',
        source: 'campus-incidents',
        layout: { visibility: 'none' },
        paint: { 'circle-radius': 8, 'circle-color': '#c43d4b', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
      });
      map.on('click', 'campus-incident-points', event => {
        const p = event.features?.[0]?.properties || {};
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat(event.lngLat)
          .setHTML('<strong>' + esc(p.category || 'Incident') + '</strong><br>Severity: ' + esc(p.severity || 'Unspecified') + '<br>Status: ' + esc(p.status || 'Open') + '<br>' + esc(p.location || 'Location recorded'))
          .addTo(map);
      });
      map.on('mouseenter', 'campus-incident-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'campus-incident-points', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'campus-draft-clusters', event => {
        const clusterFeature = event.features?.[0];
        if (!clusterFeature) return;
        const clusterId = clusterFeature.properties?.cluster_id;
        const source = map.getSource('campus-drafts');
        source?.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return setStatus('Could not expand this group of draft pins.', 'warning');
          map.easeTo({ center: clusterFeature.geometry.coordinates, zoom, duration: 450 });
        });
      });
      map.on('mouseenter', 'campus-draft-clusters', () => { map.getCanvas().style.cursor = 'zoom-in'; });
      map.on('mouseleave', 'campus-draft-clusters', () => { map.getCanvas().style.cursor = placementMode ? 'crosshair' : ''; });
      map.on('click', 'campus-draft-points', event => {
        if (!isCampusAdmin) return;
        const id = event.features?.[0]?.properties?.id;
        const draft = adminDrafts.find(item => item.id === id);
        if (draft) {
          editAdminFeature(draft);
          setStatus('Draft selected. Confirm the exact building entrance before marking it verified.', 'warning');
        }
      });
      map.on('mouseenter', 'campus-draft-points', () => { map.getCanvas().style.cursor = isCampusAdmin ? 'pointer' : ''; });
      map.on('mouseleave', 'campus-draft-points', () => { map.getCanvas().style.cursor = placementMode ? 'crosshair' : ''; });
      map.on('click', event => {
        if (!placementMode || !isCampusAdmin) return;
        applyAdminCoordinates(event.lngLat.lat, event.lngLat.lng, 'manual map selection');
        placementMode = false;
        map.getCanvas().style.cursor = '';
        $('campus-map-pick-pin')?.classList.remove('primary');
      });
      map.on('zoomend', updateMapScaleSummary);
      map.on('pitchend', updateMapScaleSummary);
      map.on('error', event => {
        const now = Date.now();
        if (now - lastMapErrorAt < 4000) return;
        lastMapErrorAt = now;
        const sourceId = event.sourceId || event.source?.id || '';
        const message = String(event.error?.message || 'Map resource failed to load');
        if (sourceId === 'campus-esri-imagery') {
          setStatus('Satellite tiles are temporarily unavailable at this zoom. Try zooming out or switching to 2D.', 'warning');
        } else if (sourceId === 'campus-openfreemap-buildings') {
          setStatus('3D building data is temporarily unavailable. The satellite map remains available.', 'warning');
        } else if (/webgl|context lost/i.test(message)) {
          setStatus('Map graphics were interrupted by the browser. Refresh the map or switch to 2D.', 'warning');
        }
      });

      const maptilerKey = window.CampusShieldMapConfig?.maptilerKey;
      if (typeof maptilerKey === 'string' && maptilerKey.trim()) {
        const key = encodeURIComponent(maptilerKey.trim());
        map.addSource('campus-terrain', {
          type: 'raster-dem',
          url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=' + key,
          tileSize: 512,
          maxzoom: 14,
          encoding: 'mapbox'
        });
      }
      map.on('click', 'campus-feature-points', event => {
        const id = event.features?.[0]?.properties?.id;
        const feature = features.find(item => item.id === id);
        if (feature) selectFeature(feature, true);
      });
      map.on('mouseenter', 'campus-feature-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'campus-feature-points', () => { map.getCanvas().style.cursor = ''; });
      updateSource();
      updateDraftSource();
      updateIncidentSource();
      applyMapMode(mapMode, false);
      // The initial camera move may be requested before the MapLibre style is ready.
      // Re-apply it after load so the first visible frame lands at campus scale.
      fitCampus();
      updateMapScaleSummary();
    });
    return map;
  }

  function featureCollection(items) {
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(item.longitude), Number(item.latitude)] },
        properties: { id: item.id, name: item.name, feature_type: item.feature_type, category: item.category, severity: item.severity, status: item.status, location: item.location }
      }))
    };
  }

  function updateSource() {
    const source = map?.getSource('campus-features');
    if (source) source.setData(featureCollection(features));
  }

  function updateDraftSource() {
    const source = map?.getSource('campus-drafts');
    if (!source) return;
    const coordinateDrafts = isCampusAdmin ? adminDrafts.filter(item =>
      item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined &&
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
    ) : [];
    source.setData(featureCollection(coordinateDrafts));
  }

  function updateMapScaleSummary() {
    const summary = $('campus-map-scale-summary');
    if (!summary || !map) return;
    const zoom = map.getZoom();
    const modeName = mapMode === '3d' ? '3D' : mapMode === 'satellite' ? 'Satellite' : 'Street';
    summary.textContent = `${modeName} · ` + (zoom >= 16
      ? `Building-level view · zoom ${zoom.toFixed(1)}`
      : zoom >= 13
        ? `Campus-area view · zoom ${zoom.toFixed(1)}`
        : `Regional view · zoom ${zoom.toFixed(1)}`);
  }

  function setLayerVisibility(id, visible) {
    if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }

  function applyMapMode(mode, animate = true) {
    if (!['2d', 'satellite', '3d'].includes(mode)) return;
    mapMode = mode;
    const satelliteOn = mode !== '2d';
    const labelsOn = mode !== '2d';
    const buildingsOn = mode === '3d';
    setLayerVisibility('osm-base', !satelliteOn);
    setLayerVisibility('campus-esri-imagery-layer', satelliteOn);
    setLayerVisibility('campus-osm-3d-buildings', buildingsOn);
    setLayerVisibility('campus-osm-3d-building-edges', buildingsOn);
    setLayerVisibility('campus-osm-3d-poi-labels', labelsOn);
    if (mode !== '3d' && map?.getTerrain()) map.setTerrain(null);
    if (mode === '3d' && map?.getSource('campus-terrain')) map.setTerrain({ source: 'campus-terrain', exaggeration: 1.1 });
    if (map) {
      const camera = mode === '3d'
        ? { pitch: 54, bearing: -16 }
        : { pitch: 0, bearing: 0 };
      map.easeTo({ ...camera, duration: animate ? 520 : 0, essential: true });
    }
    [['campus-map-2d', '2d'], ['campus-map-satellite', 'satellite'], ['campus-map-3d', '3d']].forEach(([id, key]) => {
      const button = $(id);
      button?.classList.toggle('active', mode === key);
      button?.setAttribute('aria-pressed', mode === key ? 'true' : 'false');
    });
    if (mode === '3d') {
      setStatus('3D campus view: satellite imagery with OpenStreetMap building footprints extruded to approximate heights. Building coverage and heights depend on local mapping; these are not surveyed architectural models.', 'info');
    } else if (mode === 'satellite') {
      setStatus('Satellite imagery enabled. Image resolution and capture date vary by location.', 'info');
    } else {
      setStatus('2D campus street map enabled.', 'info');
    }
  }

  function isBabcockUniversity() {
    const identity = [campus?.university_slug, campus?.university_name, campus?.name]
      .filter(Boolean).join(' ').toLowerCase();
    return identity.includes('babcock');
  }

  function getCampusCentre() {
    const selected = $('campus-map-campus-select')?.value || 'main-campus';
    if (isBabcockUniversity() && selected === 'main-campus') {
      // Official Babcock contact-page map locator. This is a campus centre, not a building pin.
      return [3.7191259, 6.8910932];
    }
    const longitude = Number(campus?.map_longitude ?? campus?.longitude);
    const latitude = Number(campus?.map_latitude ?? campus?.latitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return [longitude, latitude];
    }
    return null;
  }

  function fitCampus() {
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once('load', fitCampus);
      return;
    }
    const draftPoints = isCampusAdmin ? adminDrafts.filter(item =>
      item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined &&
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
    ) : [];
    const viewPoints = [...features, ...draftPoints];
    if (viewPoints.length && campusCenterMarker) {
      campusCenterMarker.remove();
      campusCenterMarker = null;
    }
    if (viewPoints.length === 1) {
      map.flyTo({ center: [Number(viewPoints[0].longitude), Number(viewPoints[0].latitude)], zoom: 17, pitch: 0, bearing: 0, essential: true });
      return;
    }
    if (viewPoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      viewPoints.forEach(item => bounds.extend([Number(item.longitude), Number(item.latitude)]));
      map.fitBounds(bounds, { padding: { top: 85, right: 85, bottom: 85, left: 85 }, maxZoom: 16.6, duration: 750 });
      return;
    }
    const center = getCampusCentre();
    if (center) {
      map.flyTo({ center, zoom: 16.1, pitch: 0, bearing: 0, essential: true });
      if (!campusCenterMarker) {
        campusCenterMarker = new maplibregl.Marker({ color: '#087f75' })
          .setLngLat(center)
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText('Babcock University — official campus locator, not a building pin'))
          .addTo(map);
      } else campusCenterMarker.setLngLat(center);
      setStatus('Centred on the official campus locator. Building entrances still need individual verification.', 'info');
      return;
    }
    if (campusCenterMarker) {
      campusCenterMarker.remove();
      campusCenterMarker = null;
    }
    setStatus('No verified map centre is recorded for this campus yet. Use a verified campus administrator pin or location survey.', 'warning');
  }

  function applyAdminCoordinates(latitude, longitude, source, accuracy = null) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setStatus('The selected coordinates are invalid. Choose a point within the world map.', 'error');
      return;
    }
    $('campus-map-admin-lat').value = lat.toFixed(7);
    $('campus-map-admin-lng').value = lng.toFixed(7);
    if (map && map.isStyleLoaded()) {
      if (!placementMarker) {
        placementMarker = new maplibregl.Marker({ color: '#d29332', draggable: true });
        placementMarker.on('dragend', () => {
          const point = placementMarker.getLngLat();
          $('campus-map-admin-lat').value = point.lat.toFixed(7);
          $('campus-map-admin-lng').value = point.lng.toFixed(7);
          setStatus(`Pin refined to ${point.lat.toFixed(7)}, ${point.lng.toFixed(7)}. Confirm the building entrance before verification.`, 'warning');
        });
      }
      placementMarker.setLngLat([lng, lat]).addTo(map);
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 17.5), duration: 500 });
    }
    const accuracyText = Number.isFinite(accuracy) ? ` GPS accuracy reported by the device: ±${Math.round(accuracy)} m.` : '';
    setStatus(`Candidate pin set from ${source}: ${lat.toFixed(7)}, ${lng.toFixed(7)}.${accuracyText} Drag the amber pin to refine it. It is not published or verified.`, 'warning');
    const pinStatus = $('campus-map-pin-status');
    if (pinStatus) pinStatus.textContent = `Candidate coordinates: ${lat.toFixed(7)}, ${lng.toFixed(7)}${Number.isFinite(accuracy) ? ` · reported accuracy ±${Math.round(accuracy)} m` : ''}. Verify the exact building entrance before publishing.`;
  }

  function iconFor(type) {
    return ({ security:'🛡️', medical:'✚', library:'📚', hostel:'🏠', cafeteria:'☕',
      lecture_hall:'🎓', building:'🏢', gate:'🚪', parking:'🅿️', sports:'⚽',
      assembly_point:'📍', accessible_entry:'♿' })[type] || '📍';
  }

  function renderFeatures(items = features) {
    featureList.innerHTML = items.length ? items.map(item => `
      <button type="button" class="campus-map-feature" data-feature-id="${esc(item.id)}">
        <span class="campus-map-feature-icon" aria-hidden="true">${iconFor(item.feature_type)}</span>
        <span class="campus-map-feature-copy"><strong>${esc(item.name)}</strong><small>${esc(item.feature_type.replaceAll('_',' '))}</small></span>
        <span aria-hidden="true">›</span>
      </button>`).join('') : '<p class="campus-map-empty">No verified campus locations have been published yet. Campus administrators can add locations after map-management tools are enabled.</p>';
  }

  function selectFeature(item, fly = false) {
    selectedFeature = item;
    featureList.querySelectorAll('[data-feature-id]').forEach(el => {
      el.classList.toggle('selected', el.dataset.featureId === item.id);
    });
    const emergencyLine = item.metadata?.emergency_phone ? ' Emergency line: ' + item.metadata.emergency_phone + '.' : '';
    setStatus(item.name + (item.description ? ' — ' + item.description : '') + emergencyLine);
    if (fly && map) map.flyTo({ center: [Number(item.longitude), Number(item.latitude)], zoom: 17, pitch: mapMode === '3d' ? 48 : 0, bearing: mapMode === '3d' ? -14 : 0, duration: 650, essential: true });
  }

  function currentCampusFeatures() {
    const selected = $('campus-map-campus-select')?.value || 'main-campus';
    selectedFeature = null;
    features = allFeatures.filter(item => item.is_published && item.campus_slug === selected && item.latitude != null && item.longitude != null);
    adminDrafts = isCampusAdmin ? allFeatures.filter(item => !item.is_published && item.campus_slug === selected) : [];
    updateSource();
    updateDraftSource();
    renderFeatures();
    renderAdminDrafts();
    fitCampus();
  }

  function renderAdminDrafts() {
    const host = $('campus-map-admin-drafts');
    if (!host) return;
    host.innerHTML = adminDrafts.length ? adminDrafts.map(item => {
      const hasCoordinates = item.latitude != null && item.longitude != null;
      const coordinateLabel = hasCoordinates
        ? (item.metadata?.coordinate_source_label ? 'coordinate candidate · pending local check' : 'coordinates saved · not yet verified')
        : 'coordinates missing';
      return `
      <div class="campus-map-admin-draft">
        <span><strong>${esc(item.name)}</strong><small>${esc(item.verification_status || 'pending')} · ${coordinateLabel}</small></span>
        <button type="button" data-edit-map-id="${esc(item.id)}">Edit</button>
      </div>`;
    }).join('') : '<p class="campus-map-empty">No draft locations for this campus.</p>';
  }

  function resetAdminForm() {
    placementMode = false;
    if (map) map.getCanvas().style.cursor = '';
    $('campus-map-pick-pin')?.classList.remove('primary');
    if (placementMarker) { placementMarker.remove(); placementMarker = null; }
    if ($('campus-map-pin-status')) $('campus-map-pin-status').textContent = 'Choose Pick on map or Use GPS to add a draft coordinate. The marker remains unpublished.';
    $('campus-map-feature-id').value = '';
    $('campus-map-admin-name').value = '';
    $('campus-map-admin-description').value = '';
    $('campus-map-admin-lat').value = '';
    $('campus-map-admin-lng').value = '';
    $('campus-map-admin-source').value = '';
    $('campus-map-admin-verified').checked = false;
    $('campus-map-admin-publish').checked = false;
  }

  function editAdminFeature(item) {
    $('campus-map-feature-id').value = item.id;
    $('campus-map-admin-campus').value = item.campus_name || 'Main Campus';
    $('campus-map-admin-campus-slug').value = item.campus_slug || 'main-campus';
    $('campus-map-admin-name').value = item.name || '';
    $('campus-map-admin-type').value = item.feature_type || 'building';
    $('campus-map-admin-description').value = item.description || '';
    $('campus-map-admin-lat').value = item.latitude ?? '';
    $('campus-map-admin-lng').value = item.longitude ?? '';
    const needsCoordinateEvidence = item.metadata?.coordinate_status === 'candidate_unverified';
    $('campus-map-admin-source').value = needsCoordinateEvidence ? '' : (item.source_url || '');
    if (needsCoordinateEvidence && $('campus-map-pin-status')) {
      $('campus-map-pin-status').textContent = 'This is an OpenStreetMap candidate. Add a university-approved survey or other source that confirms this exact point before verification.';
    }
    $('campus-map-admin-verified').checked = item.verification_status === 'verified';
    $('campus-map-admin-publish').checked = !!item.is_published;
    if (item.latitude != null && item.longitude != null) applyAdminCoordinates(item.latitude, item.longitude, 'saved draft');
    else if (placementMarker) { placementMarker.remove(); placementMarker = null; }
    $('campus-map-admin-name').focus();
  }

  function renderCampusOptions() {
    const select = $('campus-map-campus-select');
    if (!select) return;
    const current = select.value || 'main-campus';
    const campuses = new Map();
    allFeatures.forEach(item => campuses.set(item.campus_slug, item.campus_name));
    if (!campuses.size) campuses.set('main-campus', 'Main Campus');
    select.innerHTML = [...campuses.entries()].map(([slug, name]) =>
      '<option value="' + esc(slug) + '">' + esc(name) + '</option>').join('');
    select.value = campuses.has(current) ? current : campuses.keys().next().value;
  }

  function updateIncidentSource() {
    const source = map?.getSource('campus-incidents');
    if (!source) return;
    source.setData(featureCollection(incidentPins.map(item => ({
      id: item.id, name: item.category, feature_type: 'incident',
      longitude: item.longitude, latitude: item.latitude,
      category: item.category, severity: item.severity, status: item.status, location: item.location
    }))));
  }

  async function loadIncidentPins() {
    if (!isVerifiedStaff || !campus?.university_id) return;
    const { data, error } = await client().from('incidents')
      .select('id, category, severity, location, status, created_at, latitude, longitude')
      .eq('university_id', campus.university_id)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    incidentPins = data || [];
    const button = $('campus-map-incidents');
    if (button) button.hidden = incidentPins.length === 0;
    updateIncidentSource();
  }

  async function loadCampus() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !backend?.client) {
      campusName.textContent = 'Map configuration required';
      setStatus('CampusShield Supabase is not configured in this environment.', 'warning');
      return;
    }
    try {
      campus = await backend.getMyCampusContext();
      if (!campus?.university_id) {
        campusName.textContent = 'Join your university space';
        setStatus('Your account is not linked to a university yet. Complete campus onboarding to load its map.', 'warning');
        featureList.innerHTML = '<p class="campus-map-empty">Your university map will appear here after your campus membership is established.</p>';
        return;
      }
      campusName.textContent = campus.university_name || 'Your university';
      const auth = await client().auth.getUser();
      const user = auth.data?.user;
      if (user) {
        const [profileResult, membershipResult] = await Promise.all([
          client().from('profiles').select('role, verification_status').eq('id', user.id).maybeSingle(),
          client().from('campus_memberships').select('campus_role, membership_status, verification_status').eq('user_id', user.id).maybeSingle()
        ]);
        if (profileResult.error) throw profileResult.error;
        if (membershipResult.error) throw membershipResult.error;
        campusRole = membershipResult.data?.campus_role || null;
        const verifiedProfile = profileResult.data?.verification_status === 'verified';
        const verifiedMembership = membershipResult.data?.membership_status === 'active' && membershipResult.data?.verification_status === 'verified';
        isVerifiedStaff = verifiedProfile && verifiedMembership && ['admin','security'].includes(profileResult.data?.role) && ['admin','security'].includes(campusRole);
        isCampusAdmin = verifiedProfile && verifiedMembership && profileResult.data?.role === 'admin' && campusRole === 'admin';
      }
      $('campus-map-admin').hidden = !isCampusAdmin;
      const query = client().from('campus_map_features')
        .select('id, university_id, campus_name, campus_slug, feature_type, name, description, latitude, longitude, source_url, verification_status, verified_by, verified_at, is_published, metadata')
        .eq('university_id', campus.university_id)
        .order('name', { ascending: true })
        .limit(500);
      if (!isCampusAdmin) query.eq('is_published', true);
      const { data, error } = await query;
      if (error) throw error;
      allFeatures = data || [];
      renderCampusOptions();
      currentCampusFeatures();
      await loadIncidentPins();
      setStatus(features.length
        ? features.length + ' verified campus locations loaded.'
        : 'This campus has no verified map pins yet. Administrators can review the prepared location directory.', 'info');
    } catch (error) {
      console.error('CampusMap could not load campus locations.', error);
      setStatus('Campus map data could not be loaded. Check your campus membership and staging migration.', 'error');
    }
  }

  function filterFeatures(query) {
    const term = query.trim().toLocaleLowerCase();
    const matches = !term ? features : features.filter(item =>
      [item.name, item.feature_type, item.description].some(value => String(value || '').toLocaleLowerCase().includes(term))
    );
    const draftMatches = isCampusAdmin && term ? adminDrafts.filter(item =>
      [item.name, item.feature_type, item.description, item.campus_name].some(value => String(value || '').toLocaleLowerCase().includes(term))
    ) : [];
    renderFeatures(matches);
    results.hidden = !term;
    if (term) {
      const resultRows = [
        ...matches.map(item => `<button type="button" class="campus-map-search-result" data-search-feature-id="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(item.feature_type.replaceAll('_',' '))}</small></span><em>Published</em></button>`),
        ...draftMatches.map(item => `<button type="button" class="campus-map-search-result is-draft" data-search-draft-id="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(item.feature_type.replaceAll('_',' '))} · ${item.latitude == null ? 'coordinates missing' : 'candidate pin'}</small></span><em>Admin draft</em></button>`)
      ];
      results.innerHTML = resultRows.length ? resultRows.join('') : '<p class="campus-map-search-empty">No campus locations match this search.</p>';
    } else {
      results.innerHTML = '';
    }
    if (matches.length === 1 && draftMatches.length === 0) selectFeature(matches[0], true);
  }

  results?.addEventListener('click', event => {
    const publishedButton = event.target.closest('[data-search-feature-id]');
    const draftButton = event.target.closest('[data-search-draft-id]');
    if (publishedButton) {
      const item = features.find(feature => feature.id === publishedButton.dataset.searchFeatureId);
      if (item) selectFeature(item, true);
    } else if (draftButton && isCampusAdmin) {
      const item = adminDrafts.find(feature => feature.id === draftButton.dataset.searchDraftId);
      if (item) {
        editAdminFeature(item);
        setStatus('Administrator draft opened from search. Verify the exact position before publishing.', 'warning');
      }
    }
  });

  $('campus-map-campus-select')?.addEventListener('change', () => {
    currentCampusFeatures();
    incidentPins = [];
    loadIncidentPins().catch(error => console.warn('Incident pins unavailable.', error));
  });
  $('campus-map-admin-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can save map locations.', 'warning');
    const numberOrNull = value => value === '' ? null : Number(value);
    const payload = {
      p_feature_id: $('campus-map-feature-id').value || null,
      p_campus_name: $('campus-map-admin-campus').value.trim(),
      p_campus_slug: $('campus-map-admin-campus-slug').value.trim(),
      p_feature_type: $('campus-map-admin-type').value,
      p_name: $('campus-map-admin-name').value.trim(),
      p_description: $('campus-map-admin-description').value.trim() || null,
      p_latitude: numberOrNull($('campus-map-admin-lat').value),
      p_longitude: numberOrNull($('campus-map-admin-lng').value),
      p_source_url: $('campus-map-admin-source').value.trim() || null,
      p_mark_verified: $('campus-map-admin-verified').checked,
      p_publish: $('campus-map-admin-publish').checked
    };
    const hasCoordinatePair = payload.p_latitude !== null && payload.p_longitude !== null;
    if ((payload.p_mark_verified || payload.p_publish) && (!hasCoordinatePair || !payload.p_source_url)) {
      return setStatus('Verification requires both coordinates and an evidence URL. Use Pick on map or Use GPS, then add a source that supports the exact location.', 'warning');
    }
    if (payload.p_publish && !payload.p_mark_verified) {
      return setStatus('A location cannot be published until the administrator marks it verified.', 'warning');
    }
    try {
      const { error } = await client().rpc('manage_campus_map_feature', payload);
      if (error) throw error;
      resetAdminForm();
      setStatus('Campus location saved. Draft pins are visible only to verified campus administrators until verification and publication.', 'success');
      await loadCampus();
    } catch (error) {
      setStatus(error.message || 'Could not save this campus location.', 'error');
    }
  });
  $('campus-map-admin-reset')?.addEventListener('click', resetAdminForm);
  $('campus-map-pick-pin')?.addEventListener('click', () => {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can place draft pins.', 'warning');
    if (!ensureMap()) return setStatus('The map is still loading. Try again when it is ready.', 'warning');
    placementMode = true;
    $('campus-map-pick-pin').classList.add('primary');
    map.getCanvas().style.cursor = 'crosshair';
    setStatus('Pin placement active: click the centre of the correct building footprint or its main entrance. The amber marker can be dragged to refine it.', 'info');
    $('campus-map-pin-status').textContent = 'Pin placement active. Click the map once at the exact entrance or building footprint.';
  });
  $('campus-map-use-gps')?.addEventListener('click', () => {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can place draft pins.', 'warning');
    if (!navigator.geolocation) return setStatus('This browser does not support GPS location.', 'warning');
    setStatus('Requesting precise device location. Stand at the building entrance and allow location access.', 'info');
    navigator.geolocation.getCurrentPosition(position => {
      applyAdminCoordinates(position.coords.latitude, position.coords.longitude, 'device GPS', position.coords.accuracy);
    }, error => {
      const reason = error.code === 1 ? 'Location permission was denied.' : error.code === 2 ? 'The device could not determine your location.' : 'The GPS request timed out.';
      setStatus(reason + ' You can use Pick on map instead.', 'warning');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  $('campus-map-preview-pin')?.addEventListener('click', () => {
    const latitude = Number($('campus-map-admin-lat').value);
    const longitude = Number($('campus-map-admin-lng').value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return setStatus('Enter both latitude and longitude first.', 'warning');
    applyAdminCoordinates(latitude, longitude, 'manual coordinate preview');
  });
  $('campus-map-center')?.addEventListener('click', () => fitCampus());
  $('campus-map-admin-drafts')?.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-map-id]');
    if (!button) return;
    const item = allFeatures.find(feature => feature.id === button.dataset.editMapId);
    if (item) editAdminFeature(item);
  });
  $('campus-map-emergency')?.addEventListener('click', () => {
    emergencyOnly = !emergencyOnly;
    if (map?.getLayer('campus-feature-points')) {
      map.setFilter('campus-feature-points', emergencyOnly
        ? ['in', ['get', 'feature_type'], ['literal', ['medical','security','assembly_point','emergency_point','gate']]]
        : null);
    }
    $('campus-map-emergency').classList.toggle('primary', emergencyOnly);
    setStatus(emergencyOnly ? 'Showing medical, security, assembly and gate locations.' : 'Showing all published campus locations.');
  });
  $('campus-map-incidents')?.addEventListener('click', () => {
    if (!isVerifiedStaff || !map?.getLayer('campus-incident-points')) return;
    incidentsVisible = !incidentsVisible;
    map.setLayoutProperty('campus-incident-points', 'visibility', incidentsVisible ? 'visible' : 'none');
    $('campus-map-incidents').classList.toggle('primary', incidentsVisible);
    setStatus(incidentsVisible ? 'Showing up to 100 geolocated incidents for your university. Reporter identities and descriptions are not displayed.' : 'Incident pins hidden.');
  });
  $('report-use-location')?.addEventListener('click', () => {
    const status = $('report-location-status');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location services are unavailable in this browser.';
      return;
    }
    if (status) status.textContent = 'Requesting location permission…';
    navigator.geolocation.getCurrentPosition(position => {
      $('report-latitude').value = String(position.coords.latitude);
      $('report-longitude').value = String(position.coords.longitude);
      if (status) status.textContent = 'GPS location attached to this report. It will be visible only under your campus incident access rules.';
    }, () => {
      if (status) status.textContent = 'Location permission was denied or your position could not be determined. You can still submit the text location.';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });
  $('reportForm')?.addEventListener('reset', () => {
    if ($('report-latitude')) $('report-latitude').value = '';
    if ($('report-longitude')) $('report-longitude').value = '';
    if ($('report-location-status')) $('report-location-status').textContent = 'Optional: attach your GPS location to help authorized campus responders find the place.';
  });

  search?.addEventListener('input', () => filterFeatures(search.value));
  featureList?.addEventListener('click', event => {
    const button = event.target.closest('[data-feature-id]');
    if (!button) return;
    const item = features.find(feature => feature.id === button.dataset.featureId);
    if (item) selectFeature(item, true);
  });

  $('campus-map-2d')?.addEventListener('click', () => applyMapMode('2d'));
  $('campus-map-satellite')?.addEventListener('click', () => applyMapMode('satellite'));
  $('campus-map-3d')?.addEventListener('click', () => applyMapMode('3d'));

  $('campus-map-locate')?.addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Location services are not available in this browser.', 'warning');
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(position => {
      const coords = [position.coords.longitude, position.coords.latitude];
      if (!userMarker) userMarker = new maplibregl.Marker({ color: '#087f75' }).setLngLat(coords).addTo(map);
      else userMarker.setLngLat(coords);
      map.flyTo({ center: coords, zoom: 17, pitch: 40 });
      setStatus('Your location is shown on this device. It is not shared with other users.');
    }, () => setStatus('Location permission was denied or your position is unavailable.', 'warning'), {
      enableHighAccuracy: true, timeout: 12000, maximumAge: 30000
    });
  });

  $('campus-map-route')?.addEventListener('click', async () => {
    if (!selectedFeature) return setStatus('Choose a campus location first to prepare directions.', 'warning');
    if (!navigator.geolocation) return setStatus('Your browser does not support location services.', 'warning');
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const start = [position.coords.longitude, position.coords.latitude];
        const end = [Number(selectedFeature.longitude), Number(selectedFeature.latitude)];
        const url = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/' +
          start.join(',') + ';' + end.join(',') + '?overview=full&geometries=geojson';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Route service unavailable');
        const payload = await response.json();
        const route = payload.routes?.[0];
        if (!route) throw new Error('No walking route found');
        const source = map.getSource('campus-walking-route');
        const geojson = { type: 'Feature', properties: {}, geometry: route.geometry };
        if (source) source.setData(geojson);
        else {
          map.addSource('campus-walking-route', { type: 'geojson', data: geojson });
          map.addLayer({ id: 'campus-walking-route-line', type: 'line', source: 'campus-walking-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#087f75', 'line-width': 5, 'line-opacity': .9 } });
        }
        map.fitBounds(new maplibregl.LngLatBounds(start, end), { padding: 70, maxZoom: 17 });
        setStatus('Walking route: approximately ' + (route.distance / 1000).toFixed(2) +
          ' km. Route estimates depend on available OpenStreetMap paths.');
      } catch (error) {
        setStatus('Walking directions are unavailable for this route right now.', 'warning');
      }
    }, () => setStatus('Allow location access to calculate a walking route.', 'warning'));
  });

  function scheduleMapResize() {
    if (!map || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!map) return;
      map.resize();
      updateMapScaleSummary();
    });
  }

  if (typeof ResizeObserver !== 'undefined' && mapHost) {
    resizeObserver = new ResizeObserver(scheduleMapResize);
    resizeObserver.observe(mapHost);
  }
  window.addEventListener('resize', scheduleMapResize, { passive: true });
  window.addEventListener('orientationchange', scheduleMapResize, { passive: true });
  document.fonts?.ready?.then(scheduleMapResize).catch(() => {});

  const observer = new MutationObserver(() => {
    if (root.classList.contains('active')) {
      if (!map) ensureMap();
      else scheduleMapResize();
      if (!campus && client()) loadCampus();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });

  // Initialise lazily when the map page is opened, keeping initial app load light.
  document.addEventListener('click', event => {
    if (event.target.closest('[data-page="campus-map"]')) {
      if (!map) ensureMap();
      else scheduleMapResize();
      if (!campus) loadCampus();
    }
  });

  window.CampusShieldCampusMap = { refresh: loadCampus, reloadIncidents: loadIncidentPins };
})();
