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
  let campusProfiles = [];
  let activeCampusProfile = null;
  let campusBuildings = [];
  let selectedBuildingForReview = null;
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
  let campusCenterMarkerKind = null;
  let placementMarker = null;
  let placementMode = false;
  let profilePlacementMode = false;
  let profileCenterMarker = null;
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

  function motionDuration(milliseconds) {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
  }

  // Administrative-area centres are regional fallbacks only; they are not campus pins.
  // Source: Open Admin Data Nigeria state centroids (CC BY 4.0).
  const STATE_OVERVIEWS = {
    'abia':[7.488,5.432], 'adamawa':[12.292,9.163], 'akwa ibom':[7.796,4.990],
    'anambra':[6.938,6.249], 'bauchi':[9.326,10.998], 'bayelsa':[5.951,4.827],
    'benue':[8.812,7.301], 'borno':[13.428,11.870], 'cross river':[8.403,5.791],
    'delta':[5.500,5.757], 'ebonyi':[8.067,6.240], 'edo':[5.874,6.665],
    'ekiti':[5.298,7.695], 'enugu':[7.393,6.520], 'fct':[7.191,9.013],
    'gombe':[11.225,10.431], 'imo':[7.033,5.566], 'jigawa':[9.625,11.981],
    'kaduna':[7.859,10.257], 'kano':[8.543,11.573], 'katsina':[7.500,12.236],
    'kebbi':[3.966,11.691], 'kogi':[6.849,7.636], 'kwara':[4.567,9.093],
    'lagos':[3.712,6.535], 'nasarawa':[8.211,8.589], 'niger':[5.711,9.774],
    'ogun':[3.263,7.127], 'ondo':[4.869,6.824], 'osun':[4.521,7.538],
    'oyo':[3.613,8.135], 'plateau':[9.628,9.380], 'rivers':[6.836,5.023],
    'sokoto':[5.237,12.739], 'taraba':[10.386,8.059], 'yobe':[11.524,11.974],
    'zamfara':[6.051,12.013]
  };

  function stateOverviewCentre(value) {
    const key = String(value || '').toLowerCase()
      .replace(/\bfederal capital territory\b|\bfct(?:\s+abuja)?\b|\babuja\b/g, 'fct')
      .replace(/[,.]/g, ' ').replace(/\bstate\b/g, '').replace(/\s+/g, ' ').trim();
    return STATE_OVERVIEWS[key] || null;
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
      center: [8.6753, 9.0820],
      zoom: 5.3,
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

      map.addSource('campus-campus-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'campus-campus-boundary-fill',
        type: 'fill',
        source: 'campus-campus-boundary',
        paint: {
          'fill-color': ['case', ['==', ['get', 'boundary_status'], 'verified'], '#4f9b78', '#d59a3a'],
          'fill-opacity': ['case', ['==', ['get', 'boundary_status'], 'verified'], 0.10, 0.06]
        }
      });
      map.addLayer({
        id: 'campus-campus-boundary-verified-line',
        type: 'line',
        source: 'campus-campus-boundary',
        filter: ['==', ['get', 'boundary_status'], 'verified'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#247552', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 17, 2.5], 'line-opacity': 0.9 }
      });
      map.addLayer({
        id: 'campus-campus-boundary-candidate-line',
        type: 'line',
        source: 'campus-campus-boundary',
        filter: ['==', ['get', 'boundary_status'], 'candidate'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#bd7e23', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 17, 2.5], 'line-dasharray': [2, 2], 'line-opacity': 0.95 }
      });
      map.addSource('campus-curated-buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'campus-curated-building-footprints',
        type: 'fill',
        source: 'campus-curated-buildings',
        layout: { visibility: 'visible' },
        paint: { 'fill-color': ['case', ['==', ['get', 'verification_status'], 'verified'], ['coalesce', ['get', 'roof_colour'], ['get', 'facade_colour'], '#9fbca9'], ['coalesce', ['get', 'roof_colour'], '#d9a552']], 'fill-opacity': 0.22 }
      });
      map.addLayer({
        id: 'campus-curated-building-verified-outline',
        type: 'line',
        source: 'campus-curated-buildings',
        filter: ['==', ['get', 'verification_status'], 'verified'],
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': '#3d7962', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.7, 19, 1.6], 'line-opacity': 0.85 }
      });
      map.addLayer({
        id: 'campus-curated-building-candidate-outline',
        type: 'line',
        source: 'campus-curated-buildings',
        filter: ['==', ['get', 'verification_status'], 'pending'],
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': '#b97719', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 19, 2], 'line-dasharray': [2, 2], 'line-opacity': 0.95 }
      });
      map.addLayer({
        id: 'campus-curated-building-extrusions',
        type: 'fill-extrusion',
        source: 'campus-curated-buildings',
        minzoom: 14,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': ['case', ['==', ['get', 'verification_status'], 'verified'], ['coalesce', ['get', 'facade_colour'], '#d5c1a0'], '#dfb56f'],
          'fill-extrusion-height': ['get', 'render_height_m'],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height_m'], 0],
          'fill-extrusion-opacity': 0.98,
          'fill-extrusion-vertical-gradient': true
        }
      });
      map.addLayer({
        id: 'campus-curated-building-3d-outline',
        type: 'line',
        source: 'campus-curated-buildings',
        minzoom: 15,
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': '#6e5c45', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.45, 19, 1.1], 'line-opacity': 0.7 }
      });
      map.addLayer({
        id: 'campus-curated-building-labels',
        type: 'symbol',
        source: 'campus-curated-buildings',
        minzoom: 17,
        filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 17, 9, 19, 12],
          'text-anchor': 'center',
          'text-allow-overlap': false
        },
        paint: { 'text-color': '#2b3e34', 'text-halo-color': '#fff8e8', 'text-halo-width': 1.8 }
      });
      map.on('click', 'campus-curated-building-extrusions', event => {
        const item = event.features?.[0]?.properties || {};
        const elevation = item.height_m ? `${Number(item.height_m).toFixed(1)} m tagged height` : item.levels ? `${item.levels} levels · rendered using an estimated floor height` : 'Height not mapped · shown with a visual fallback';
        if (isCampusAdmin && item.verification_status === 'pending' && item.id) selectCampusBuildingForReview(item.id);
        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(event.lngLat)
          .setHTML(`<strong>${esc(item.name || 'Unlabelled campus building')}</strong><br>${esc(item.building_class || 'Building')}<br>${esc(elevation)}<br>${esc(item.verification_status || 'pending review')}`)
          .addTo(map);
      });
      map.on('mouseenter', 'campus-curated-building-extrusions', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'campus-curated-building-extrusions', () => { map.getCanvas().style.cursor = placementMode || profilePlacementMode ? 'crosshair' : ''; });

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

      // Campus roads and paths use real OpenMapTiles transportation geometry derived
      // from OpenStreetMap. Keep these layers enabled in 2D, satellite and 3D modes;
      // never synthesize connecting lines where the source has no mapped geometry.
      const roadLineLayout = { 'line-cap': 'round', 'line-join': 'round' };
      const roadZoomWidth = (low, high) => ['interpolate', ['linear'], ['zoom'], 12, low, 16, high];
      map.addLayer({
        id: 'campus-roads-main-casing',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#ffffff',
          'line-width': roadZoomWidth(3.2, 8.5),
          'line-opacity': 0.96
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-roads-main',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#59645f',
          'line-width': roadZoomWidth(2.1, 6.2),
          'line-opacity': 0.98
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-roads-secondary-casing',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'secondary_link', 'tertiary_link']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#ffffff',
          'line-width': roadZoomWidth(2.2, 5.2),
          'line-opacity': 0.94
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-roads-secondary',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#87918b',
          'line-width': roadZoomWidth(1.35, 3.5),
          'line-opacity': 0.98
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-roads-local',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['in', ['get', 'class'], ['literal', ['service', 'living_street']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#f8faf7',
          'line-width': roadZoomWidth(1.1, 2.8),
          'line-opacity': 0.98
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-footpaths',
        type: 'line',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
        layout: roadLineLayout,
        paint: {
          'line-color': '#d0a96b',
          'line-width': roadZoomWidth(0.9, 2.1),
          'line-dasharray': [1.4, 1.5],
          'line-opacity': 0.98
        }
      }, 'campus-feature-points');
      map.addLayer({
        id: 'campus-road-labels',
        type: 'symbol',
        source: 'campus-openfreemap-buildings',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name'], ['get', 'ref']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 12],
          'text-max-angle': 35,
          'text-keep-upright': true,
          'text-padding': 3,
          'symbol-spacing': 260,
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#34443d',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
          'text-halo-blur': 0.3
        }
      }, 'campus-feature-points');
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
          map.easeTo({ center: clusterFeature.geometry.coordinates, zoom, duration: motionDuration(450) });
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
        if (profilePlacementMode && isCampusAdmin) {
          setProfileCentreCoordinates(event.lngLat.lat, event.lngLat.lng, 'manual map selection');
          profilePlacementMode = false;
          map.getCanvas().style.cursor = '';
          $('campus-map-profile-pick')?.classList.remove('primary');
          return;
        }
        if (!placementMode || !isCampusAdmin) return;
        applyAdminCoordinates(event.lngLat.lat, event.lngLat.lng, 'manual map selection');
        placementMode = false;
        map.getCanvas().style.cursor = '';
        $('campus-map-pick-pin')?.classList.remove('primary');
      });
      map.on('zoomend', () => { updateMapScaleSummary(); updateBuildingCoverageSummary(); });
      map.on('pitchend', () => { updateMapScaleSummary(); updateBuildingCoverageSummary(); });
      map.on('moveend', updateBuildingCoverageSummary);
      map.on('idle', updateBuildingCoverageSummary);
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
      // Keep street names legible above raised buildings, while keeping interactive
      // campus pins and verified features above the labels.
      if (map.getLayer('campus-road-labels')) map.moveLayer('campus-road-labels', 'campus-feature-points');
      updateSource();
      updateDraftSource();
      updateIncidentSource();
      // Campus/profile data may finish loading before or after MapLibre's first style load.
      // Push the latest state into the freshly-created sources in either order.
      updateCampusBoundarySource();
      updateCampusBuildingSource();
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

  function validMapColour(value) {
    return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : null;
  }

  function buildingFeatureCollection(items) {
    return {
      type: 'FeatureCollection',
      features: items.filter(item =>
        item.geometry_geojson && ['Polygon','MultiPolygon'].includes(item.geometry_geojson.type)
      ).map(item => {
        const taggedHeight = Number(item.height_m);
        const levels = Number(item.levels);
        const hasTaggedHeight = item.height_m != null && Number.isFinite(taggedHeight) && taggedHeight > 0;
        const hasLevels = item.levels != null && Number.isFinite(levels) && levels > 0;
        const minHeightValue = item.min_height_m == null ? 0 : Number(item.min_height_m);
        const minHeight = Number.isFinite(minHeightValue) && minHeightValue >= 0 ? minHeightValue : 0;
        const baseRenderHeight = hasTaggedHeight ? taggedHeight : hasLevels ? Math.min(300, levels * 3.2) : 6.5;
        const renderHeight = Math.min(302, Math.max(baseRenderHeight, minHeight + 1.5));
        return {
          type: 'Feature',
          id: item.id,
          geometry: item.geometry_geojson,
          properties: {
            id: item.id,
            name: item.name || '',
            building_class: item.building_class || 'building',
            verification_status: item.verification_status || 'pending',
            height_m: hasTaggedHeight ? taggedHeight : null,
            min_height_m: minHeight,
            levels: hasLevels ? levels : null,
            render_height_m: renderHeight,
            height_method: hasTaggedHeight ? 'OpenStreetMap height tag' : hasLevels ? 'estimated from floor count' : 'visual fallback only',
            roof_shape: item.roof_shape || '',
            roof_material: item.roof_material || '',
            roof_colour: validMapColour(item.roof_colour) || '',
            facade_material: item.facade_material || '',
            facade_colour: validMapColour(item.facade_colour) || ''
          }
        };
      })
    };
  }

  function updateCampusBoundarySource() {
    const source = map?.getSource('campus-campus-boundary');
    if (!source) return;
    const geometry = activeCampusProfile?.boundary_geojson;
    const status = activeCampusProfile?.boundary_status || 'missing';
    const valid = geometry && ['Polygon','MultiPolygon'].includes(geometry.type)
      && Array.isArray(geometry.coordinates);
    source.setData(valid && status !== 'missing' ? {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry,
        properties: {
          campus_name: activeCampusProfile?.campus_name || '',
          boundary_status: status
        }
      }]
    } : { type: 'FeatureCollection', features: [] });
  }

  function updateCampusBuildingSource() {
    const source = map?.getSource('campus-curated-buildings');
    if (source) source.setData(buildingFeatureCollection(campusBuildings));
    if (map) {
      const hasUniversityFootprints = campusBuildings.length > 0;
      setLayerVisibility('campus-osm-3d-buildings', mapMode === '3d' && !hasUniversityFootprints);
      setLayerVisibility('campus-osm-3d-building-edges', mapMode === '3d' && !hasUniversityFootprints);
      setLayerVisibility('campus-curated-building-extrusions', mapMode === '3d' && hasUniversityFootprints);
      setLayerVisibility('campus-curated-building-3d-outline', mapMode === '3d' && hasUniversityFootprints);
      setLayerVisibility('campus-curated-building-labels', mapMode !== '2d' && hasUniversityFootprints);
    }
    updateBuildingCoverageSummary();
  }

  async function loadCampusBuildings() {
    if (!campus?.university_id || !activeCampusProfile?.id) {
      campusBuildings = [];
      selectedBuildingForReview = null;
      updateCampusBuildingSource();
      renderAdminBuildingCandidates();
      return;
    }
    const { data, error } = await client().from('campus_map_buildings')
      .select('id,university_id,campus_id,campus_slug,source_provider,source_feature_id,name,building_class,geometry_geojson,center_latitude,center_longitude,height_m,min_height_m,levels,roof_shape,roof_material,roof_colour,facade_material,facade_colour,source_url,source_license,verification_evidence_url,verification_status,is_published,metadata')
      .eq('university_id', campus.university_id)
      .eq('campus_id', activeCampusProfile.id)
      .order('name', { ascending: true })
      .limit(1500);
    if (error) {
      campusBuildings = [];
      updateCampusBuildingSource();
      renderAdminBuildingCandidates();
      console.warn('Curated campus building footprints are unavailable.', error);
      return;
    }
    campusBuildings = data || [];
    updateCampusBuildingSource();
    renderAdminBuildingCandidates();
    if (selectedBuildingForReview && !campusBuildings.some(item => item.id === selectedBuildingForReview)) {
      selectedBuildingForReview = null;
      $('campus-map-building-review')?.setAttribute('hidden', '');
    }
  }

  function renderAdminBuildingCandidates() {
    const host = $('campus-map-building-candidates');
    if (!host) return;
    if (!isCampusAdmin) {
      host.innerHTML = '';
      return;
    }
    const pending = campusBuildings.filter(item => !item.is_published && item.verification_status === 'pending');
    const visible = pending.slice(0, 120);
    host.innerHTML = pending.length ? visible.map(item => {
      const title = item.name || 'Unlabelled building';
      const detail = item.height_m != null ? Number(item.height_m).toFixed(1) + ' m tagged height'
        : item.levels != null ? item.levels + ' floors · estimated height'
        : 'height not mapped';
      return '<div class="campus-map-building-candidate">' +
        '<span><strong>' + esc(title) + '</strong><small>' + esc(item.building_class || 'building') + ' · ' + esc(detail) + '</small></span>' +
        '<button type="button" data-review-building-id="' + esc(item.id) + '">Review</button>' +
        '</div>';
    }).join('') + (pending.length > visible.length ? '<p class="campus-map-profile-help">Showing 120 of ' + pending.length + ' candidates. Use the map to inspect the rest.</p>' : '')
      : '<p class="campus-map-profile-help">No pending building footprints for this campus yet.</p>';
    const count = $('campus-map-building-import-status');
    if (count && !count.dataset.importing) {
      count.textContent = pending.length
        ? pending.length + ' building footprints awaiting local review. None are published.'
        : 'No imported building footprints yet.';
    }
  }

  function selectCampusBuildingForReview(buildingId) {
    if (!isCampusAdmin) return;
    const item = campusBuildings.find(building => building.id === buildingId);
    if (!item) return;
    selectedBuildingForReview = item.id;
    $('campus-map-building-review').hidden = false;
    $('campus-map-building-review-name').textContent = item.name || 'Unlabelled building · OSM way ' + item.source_feature_id;
    $('campus-map-building-review-evidence').value = '';
    $('campus-map-building-review-confirm').checked = false;
    const dimensions = [
      item.height_m != null ? Number(item.height_m).toFixed(1) + ' m tagged' : null,
      item.levels != null ? item.levels + ' levels' : null,
      item.roof_shape ? 'roof: ' + item.roof_shape : null
    ].filter(Boolean);
    $('campus-map-building-review-details').textContent =
      (item.building_class || 'building') + ' · ' + (dimensions.join(' · ') || 'height/roof data not mapped');
    if (map && Number.isFinite(Number(item.center_latitude)) && Number.isFinite(Number(item.center_longitude))) {
      map.flyTo({
        center: [Number(item.center_longitude), Number(item.center_latitude)],
        zoom: 18,
        pitch: mapMode === '3d' ? 48 : 0,
        bearing: mapMode === '3d' ? -14 : 0,
        duration: motionDuration(550)
      });
    }
    setStatus('Building candidate selected. Compare its outline and entrance with a university plan or on-site survey before verifying.', 'warning');
  }

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
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 200 ? parsed : null;
  }

  function osmWayToBuildingCandidate(way) {
    const tags = way.tags || {};
    if (!Array.isArray(way.geometry) || way.geometry.length < 4) return null;
    const ring = way.geometry
      .filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)))
      .map(point => [Number(point.lon), Number(point.lat)]);
    if (ring.length < 4) return null;
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    if (ring.length > 2000) return null;
    const openRing = ring.slice(0, -1);
    const centerLongitude = openRing.reduce((sum, point) => sum + point[0], 0) / openRing.length;
    const centerLatitude = openRing.reduce((sum, point) => sum + point[1], 0) / openRing.length;
    const height = parseOsmLength(tags.height);
    const minHeight = parseOsmLength(tags.min_height);
    const levels = parseOsmLevels(tags['building:levels'] ?? tags.levels);
    return {
      source_feature_id: String(way.id),
      name: tags.name || tags['name:en'] || null,
      building_class: tags.building || 'yes',
      geometry_geojson: { type: 'Polygon', coordinates: [ring] },
      center_latitude: centerLatitude,
      center_longitude: centerLongitude,
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

  async function discoverCampusBuildings() {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can import building footprints.', 'warning');
    const profile = activeCampusProfile;
    if (!profile?.id || profile.center_latitude == null || profile.center_longitude == null
        || !['candidate','official_locator','verified'].includes(profile.center_status)) {
      return setStatus('Set a campus centre from a real campus reference point before searching for building footprints. State overview centroids cannot be used for a campus import.', 'warning');
    }
    const radius = Number($('campus-map-building-radius')?.value || 800);
    if (![500,800,1200].includes(radius)) return setStatus('Choose a supported building discovery radius.', 'warning');
    const latitude = Number(profile.center_latitude);
    const longitude = Number(profile.center_longitude);
    const query = '[out:json][timeout:45];way["building"](around:' + radius + ',' +
      latitude.toFixed(7) + ',' + longitude.toFixed(7) + ');out tags geom 300;';
    const button = $('campus-map-building-discover');
    const progress = $('campus-map-building-import-status');
    button.disabled = true;
    button.textContent = 'Discovering buildings…';
    progress.dataset.importing = 'true';
    progress.textContent = 'Requesting mapped building outlines from OpenStreetMap. This request runs only when an administrator starts it.';
    try {
      let payload = null;
      let lastError = null;
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];
      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 50000);
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams({ data: query }).toString(),
            signal: controller.signal
          });
          if (!response.ok) throw new Error('OpenStreetMap query service returned HTTP ' + response.status);
          payload = await response.json();
          break;
        } catch (error) {
          lastError = error;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!payload) throw lastError || new Error('No OpenStreetMap query service responded.');
      const elements = Array.isArray(payload.elements) ? payload.elements : [];
      const candidates = elements
        .filter(element => element.type === 'way' && element.tags?.building && !['no','false','0'].includes(String(element.tags.building).toLowerCase()))
        .map(osmWayToBuildingCandidate)
        .filter(Boolean);
      if (!candidates.length) {
        progress.textContent = 'No mapped building outlines were found within ' + radius + ' metres. Try a larger radius or ask the university GIS team for a campus plan.';
        return;
      }
      const { data, error } = await client().rpc('import_campus_map_building_candidates', {
        p_campus_id: profile.id,
        p_buildings: candidates
      });
      if (error) throw error;
      await loadCampusBuildings();
      const saved = Number(data?.saved_or_refreshed || 0);
      progress.textContent = saved + ' building outline candidates saved from ' + candidates.length +
        ' OpenStreetMap ways. They remain private and unpublished until the university checks them.';
      setStatus('Building footprint discovery completed. Verify each outline, floor count and entrance before publication.', 'success');
    } catch (error) {
      console.error('Campus building footprint import failed.', error);
      progress.textContent = error.message || 'Could not retrieve building footprints. Try again later or upload a university GIS file.';
      setStatus('Building discovery failed. The existing map remains available.', 'warning');
    } finally {
      delete progress.dataset.importing;
      button.disabled = false;
      button.textContent = 'Discover building footprints';
    }
  }

  async function reviewCampusBuilding(decision, publish = false) {
    if (!isCampusAdmin || !selectedBuildingForReview) return;
    const evidence = $('campus-map-building-review-evidence').value.trim();
    const confirmed = $('campus-map-building-review-confirm').checked;
    if (decision === 'verified' && (!confirmed || !/^https:\/\/[^\s]+$/i.test(evidence))) {
      return setStatus('Compare this exact footprint against an approved university plan or site survey, then add its HTTPS evidence link.', 'warning');
    }
    try {
      const { data, error } = await client().rpc('review_campus_map_building', {
        p_building_id: selectedBuildingForReview,
        p_decision: decision,
        p_verification_evidence_url: decision === 'verified' ? evidence : null,
        p_publish: decision === 'verified' && publish
      });
      if (error) throw error;
      selectedBuildingForReview = null;
      $('campus-map-building-review').hidden = true;
      await loadCampusBuildings();
      setStatus(decision === 'rejected'
        ? 'Incorrect building footprint rejected. It remains hidden from public maps.'
        : data?.is_published ? 'Verified building footprint published to this university.' : 'Building footprint verified but kept unpublished.', 'success');
    } catch (error) {
      setStatus(error.message || 'Could not review this building footprint.', 'error');
    }
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

  function updateBuildingCoverageSummary() {
    const target = $('campus-map-3d-coverage');
    if (!target) return;
    const declaredStatus = activeCampusProfile?.building_coverage_status || 'unassessed';
    if (mapMode !== '3d') {
      target.textContent = `3D building footprints: ${declaredStatus} · switch to 3D to inspect this area`;
      return;
    }
    if (!map?.isStyleLoaded()) {
      target.textContent = '3D building layers are loading.';
      return;
    }
    const hasCurated = campusBuildings.length > 0;
    const preferredLayer = hasCurated ? 'campus-curated-building-extrusions' : 'campus-osm-3d-buildings';
    const minZoom = hasCurated ? 14 : 15;
    if (map.getZoom() < minZoom) {
      target.textContent = `Zoom in to level ${minZoom}+ to inspect mapped footprints · ${hasCurated ? campusBuildings.length + ' university building records' : 'global OSM layer'} · profile: ${declaredStatus}`;
      return;
    }
    try {
      const rendered = map.getLayer(preferredLayer) ? map.queryRenderedFeatures({ layers: [preferredLayer] }) : [];
      const keys = new Set();
      for (const feature of rendered) {
        const properties = feature.properties || {};
        const geometry = feature.geometry;
        const first = geometry?.type === 'Polygon'
          ? geometry.coordinates?.[0]?.[0]
          : geometry?.type === 'MultiPolygon'
            ? geometry.coordinates?.[0]?.[0]?.[0]
            : null;
        const key = feature.id ?? properties.osm_id ?? properties.id ??
          (Array.isArray(first) ? first.map(value => Number(value).toFixed(5)).join(',') : null);
        if (key !== null && key !== undefined) keys.add(String(key));
      }
      const placeLabels = map.getLayer('campus-osm-3d-poi-labels')
        ? map.queryRenderedFeatures({ layers: ['campus-osm-3d-poi-labels'] }) : [];
      if (hasCurated) {
        const verified = campusBuildings.filter(item => item.verification_status === 'verified').length;
        const pending = campusBuildings.filter(item => item.verification_status === 'pending').length;
        const taggedHeights = campusBuildings.filter(item => item.height_m != null).length;
        const levelEstimates = campusBuildings.filter(item => item.height_m == null && item.levels != null).length;
        target.textContent = `${keys.size.toLocaleString()} imported footprints in view · ${verified} verified · ${pending} pending · heights: ${taggedHeights} tagged, ${levelEstimates} estimated, ${campusBuildings.length - taggedHeights - levelEstimates} visual fallback`;
      } else {
        target.textContent = keys.size
          ? `${keys.size.toLocaleString()} global OSM footprints visible · ${placeLabels.length} named places · building heights approximate · profile: ${declaredStatus}`
          : `No global OSM building footprints in the current view · profile status: ${declaredStatus}`;
      }
    } catch (error) {
      target.textContent = `Could not inspect 3D building coverage · profile status: ${declaredStatus}`;
    }
  }

  function applyMapMode(mode, animate = true) {
    if (!['2d', 'satellite', '3d'].includes(mode)) return;
    mapMode = mode;
    const satelliteOn = mode !== '2d';
    const labelsOn = mode !== '2d';
    const buildingsOn = mode === '3d';
    setLayerVisibility('osm-base', !satelliteOn);
    setLayerVisibility('campus-esri-imagery-layer', satelliteOn);
    const hasCuratedFootprints = campusBuildings.length > 0;
    setLayerVisibility('campus-osm-3d-buildings', buildingsOn && !hasCuratedFootprints);
    setLayerVisibility('campus-osm-3d-building-edges', buildingsOn && !hasCuratedFootprints);
    setLayerVisibility('campus-osm-3d-poi-labels', labelsOn);
    setLayerVisibility('campus-curated-building-footprints', !buildingsOn);
    setLayerVisibility('campus-curated-building-extrusions', buildingsOn && hasCuratedFootprints);
    setLayerVisibility('campus-curated-building-3d-outline', buildingsOn && hasCuratedFootprints);
    setLayerVisibility('campus-curated-building-labels', labelsOn && hasCuratedFootprints);
    if (mode !== '3d' && map?.getTerrain()) map.setTerrain(null);
    if (mode === '3d' && map?.getSource('campus-terrain')) map.setTerrain({ source: 'campus-terrain', exaggeration: 1.1 });
    if (map) {
      const camera = mode === '3d'
        ? { pitch: 54, bearing: -16 }
        : { pitch: 0, bearing: 0 };
      map.easeTo({ ...camera, duration: animate ? motionDuration(520) : 0, essential: true });
    }
    [['campus-map-2d', '2d'], ['campus-map-satellite', 'satellite'], ['campus-map-3d', '3d']].forEach(([id, key]) => {
      const button = $(id);
      button?.classList.toggle('active', mode === key);
      button?.setAttribute('aria-pressed', mode === key ? 'true' : 'false');
    });
    updateBuildingCoverageSummary();
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

  function getCampusCentreInfo() {
    if (activeCampusProfile && activeCampusProfile.center_latitude != null && activeCampusProfile.center_longitude != null) {
      return {
        center: [Number(activeCampusProfile.center_longitude), Number(activeCampusProfile.center_latitude)],
        zoom: activeCampusProfile.center_status === 'verified' ? 16.2 : 15.4,
        status: activeCampusProfile.center_status || 'candidate',
        label: activeCampusProfile.campus_name || 'Campus',
        source: activeCampusProfile.center_source_url || ''
      };
    }
    const regional = stateOverviewCentre(activeCampusProfile?.state || campus?.state);
    if (regional) return { center: regional, zoom: 8.1, status: 'regional', label: `${activeCampusProfile?.state || campus?.state || 'State'} regional overview` };
    return { center: [8.6753, 9.0820], zoom: 5.3, status: 'national', label: 'Nigeria overview' };
  }

  function fitCampus() {
    if (!map) return;
    if (!map.isStyleLoaded()) { map.once('load', fitCampus); return; }
    const draftPoints = isCampusAdmin ? adminDrafts.filter(item =>
      item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined &&
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
    ) : [];
    const viewPoints = [...features, ...draftPoints];
    if (viewPoints.length && campusCenterMarker) {
      campusCenterMarker.remove(); campusCenterMarker = null; campusCenterMarkerKind = null;
    }
    if (viewPoints.length === 1) {
      map.flyTo({ center: [Number(viewPoints[0].longitude), Number(viewPoints[0].latitude)], zoom: 17, pitch: mapMode === '3d' ? 46 : 0, bearing: mapMode === '3d' ? -12 : 0, duration: motionDuration(600), essential: true });
      return;
    }
    if (viewPoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      viewPoints.forEach(item => bounds.extend([Number(item.longitude), Number(item.latitude)]));
      map.fitBounds(bounds, { padding: { top: 85, right: 85, bottom: 85, left: 85 }, maxZoom: 16.6, duration: motionDuration(650) });
      return;
    }
    const info = getCampusCentreInfo();
    map.flyTo({ center: info.center, zoom: info.zoom, pitch: mapMode === '3d' ? 36 : 0, bearing: mapMode === '3d' ? -10 : 0, duration: motionDuration(600), essential: true });
    if (['verified','official_locator','candidate'].includes(info.status)) {
      const kind = info.status;
      const color = kind === 'candidate' ? '#d29332' : '#087f75';
      const popupText = kind === 'verified'
        ? `${info.label} — administrator-verified campus centre; not a building pin`
        : kind === 'official_locator'
          ? `${info.label} — official university locator; not an individual building entrance`
          : `${info.label} — candidate campus centre awaiting local verification`;
      if (campusCenterMarkerKind !== kind || !campusCenterMarker) {
        if (campusCenterMarker) campusCenterMarker.remove();
        campusCenterMarker = new maplibregl.Marker({ color })
          .setLngLat(info.center)
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText(popupText))
          .addTo(map);
        campusCenterMarkerKind = kind;
      } else campusCenterMarker.setLngLat(info.center);
      setStatus(kind === 'verified'
        ? `${info.label} campus centre is verified. Individual buildings still require their own verification.`
        : kind === 'official_locator'
          ? `${info.label}: official university locator loaded, not an individual building pin.`
          : `${info.label}: candidate centre. Verify the campus location before using it for directions.`, kind === 'candidate' ? 'warning' : 'info');
    } else {
      if (campusCenterMarker) campusCenterMarker.remove();
      campusCenterMarker = null; campusCenterMarkerKind = null;
      setStatus(info.status === 'regional'
        ? `Showing an approximate ${campus?.state || activeCampusProfile?.state || ''} regional overview. The university campus centre has not been verified yet.`
        : 'Showing a Nigeria overview because this university has no mapped state profile.', 'warning');
    }
    const profileStatus = $('campus-map-profile-status');
    if (profileStatus) {
      const centreState = info.status === 'regional' ? 'Regional overview only' : info.status === 'national' ? 'National overview' : info.status === 'verified' ? 'Verified campus centre' : info.status === 'official_locator' ? 'Official campus locator' : 'Candidate campus centre';
      profileStatus.textContent = `${activeCampusProfile?.campus_name || 'Main Campus'} · ${centreState} · Buildings: ${activeCampusProfile?.building_coverage_status || 'not assessed'} · 3D model: ${activeCampusProfile?.model_status || 'not submitted'}`;
    }
  }

  function setProfileCentreCoordinates(latitude, longitude, source, accuracy = null) {
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return setStatus('Campus centre coordinates are invalid.', 'error');
    $('campus-map-profile-lat').value = lat.toFixed(7);
    $('campus-map-profile-lng').value = lng.toFixed(7);
    if (map && map.isStyleLoaded()) {
      if (profileCenterMarker) profileCenterMarker.remove();
      profileCenterMarker = new maplibregl.Marker({ color: '#247a9b', draggable: true }).setLngLat([lng, lat]).addTo(map);
      profileCenterMarker.on('dragend', () => {
        const point = profileCenterMarker.getLngLat();
        $('campus-map-profile-lat').value = point.lat.toFixed(7);
        $('campus-map-profile-lng').value = point.lng.toFixed(7);
      });
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.4), duration: motionDuration(450) });
    }
    const accuracyText = Number.isFinite(accuracy) ? ` · GPS accuracy ±${Math.round(accuracy)} m` : '';
    if ($('campus-map-profile-coverage')) $('campus-map-profile-coverage').textContent = `Candidate centre from ${source}: ${lat.toFixed(7)}, ${lng.toFixed(7)}${accuracyText}. Save as candidate or verify with an official source.`;
  }

  function validateCampusBoundaryGeometry(geometry) {
    const polygons = geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : null;
    if (!Array.isArray(polygons) || !polygons.length || polygons.length > 200) return false;
    return polygons.every(rings =>
      Array.isArray(rings) && rings.length > 0 && rings.length <= 20 &&
      rings.every(ring => {
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 2000) return false;
        const first = ring[0], last = ring[ring.length - 1];
        if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) return false;
        return ring.every(point =>
          Array.isArray(point) && point.length === 2 &&
          Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) &&
          Number(point[0]) >= -180 && Number(point[0]) <= 180 &&
          Number(point[1]) >= -90 && Number(point[1]) <= 90
        );
      })
    );
  }

  async function saveCampusProfile() {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can update campus setup.', 'warning');
    const numberOrNull = value => value === '' ? null : Number(value);
    const lat = numberOrNull($('campus-map-profile-lat').value);
    const lng = numberOrNull($('campus-map-profile-lng').value);
    const verified = $('campus-map-profile-verified').checked;
    const statusValue = lat === null && lng === null ? 'missing' : verified ? 'verified' : 'candidate';
    let boundaryGeoJson = activeCampusProfile?.boundary_geojson || null;
    const boundaryRaw = $('campus-map-profile-boundary').value.trim();
    if (boundaryRaw) {
      try { boundaryGeoJson = JSON.parse(boundaryRaw); }
      catch { return setStatus('The campus boundary is not valid JSON. Paste a GeoJSON Polygon or MultiPolygon.', 'error'); }
    }
    if (boundaryGeoJson && !['Polygon','MultiPolygon'].includes(boundaryGeoJson.type)) {
      return setStatus('Campus boundary GeoJSON must be a Polygon or MultiPolygon geometry.', 'error');
    }
    if (boundaryGeoJson && !validateCampusBoundaryGeometry(boundaryGeoJson)) {
      return setStatus('Campus boundary rings need at least four valid longitude/latitude pairs, must be closed, and must stay within geographic coordinate limits.', 'error');
    }
    const boundarySource = $('campus-map-profile-boundary-source').value.trim() || activeCampusProfile?.boundary_source_url || null;
    const boundaryVerified = $('campus-map-profile-boundary-verified').checked;
    const boundaryStatus = boundaryGeoJson ? (boundaryVerified ? 'verified' : 'candidate') : 'missing';
    if (boundaryGeoJson && !boundarySource) {
      return setStatus('Add an HTTPS source for this campus boundary before saving it.', 'warning');
    }
    try {
      const { data, error } = await client().rpc('manage_campus_map_campus', {
        p_campus_id: $('campus-map-profile-id').value || null,
        p_campus_name: $('campus-map-profile-name').value.trim(),
        p_campus_slug: $('campus-map-profile-slug').value.trim(),
        p_state: $('campus-map-profile-state').value.trim(),
        p_location_hint: campus?.university_name || null,
        p_center_latitude: lat,
        p_center_longitude: lng,
        p_center_source_url: $('campus-map-profile-source').value.trim() || activeCampusProfile?.center_source_url || null,
        p_center_status: statusValue,
        p_boundary_geojson: boundaryGeoJson,
        p_boundary_source_url: boundarySource,
        p_boundary_status: boundaryStatus
      });
      if (error) throw error;
      setStatus(statusValue === 'verified'
        ? (boundaryStatus === 'verified' ? 'Campus centre and boundary saved as verified.' : 'Campus centre saved as verified; boundary remains ' + boundaryStatus + '.')
        : statusValue === 'candidate'
          ? 'Campus centre saved as a candidate; it remains unverified.'
          : 'Campus profile saved without a centre.', statusValue === 'verified' ? 'success' : 'warning');
      await loadCampus();
      const updated = campusProfiles.find(item => item.id === data) || campusProfiles.find(item => item.campus_slug === $('campus-map-profile-slug').value.trim());
      if (updated) {
        $('campus-map-campus-select').value = updated.campus_slug;
        currentCampusFeatures();
      }
    } catch (error) {
      setStatus(error.message || 'Could not save the campus profile.', 'error');
    }
  }

  async function uploadCampusGlbModel() {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can upload a building model.', 'warning');
    const profile = activeCampusProfile;
    if (!profile?.id || !profile?.university_id) {
      return setStatus('Save this campus profile before uploading its 3D model.', 'warning');
    }
    const file = $('campus-map-profile-model-file')?.files?.[0];
    if (!file) return setStatus('Choose a campus GLB model first.', 'warning');
    if (!/\.glb$/i.test(file.name)) return setStatus('Only binary glTF (.glb) files are accepted in this upload route.', 'warning');
    if (file.size > 25 * 1024 * 1024) return setStatus('This GLB is larger than the 25 MB private model limit. Optimise or compress it first.', 'warning');
    const attribution = $('campus-map-profile-model-attribution').value.trim();
    if (attribution.length < 8 || attribution.length > 500) {
      return setStatus('Add the university, surveyor or licence attribution for this 3D model (8–500 characters).', 'warning');
    }
    const uuid = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 3 | 8)).toString(16);
        });
    const path = `${profile.university_id}/${profile.id}/${uuid}.glb`;
    const uploadButton = $('campus-map-profile-model-upload');
    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading privately…';
    try {
      const { error: uploadError } = await client().storage.from('campus-map-models').upload(path, file, {
        cacheControl: '3600',
        contentType: 'model/gltf-binary',
        upsert: false
      });
      if (uploadError) throw uploadError;
      const { error: submitError } = await client().rpc('submit_campus_3d_model', {
        p_campus_id: profile.id,
        p_model_storage_path: path,
        p_model_attribution: attribution
      });
      if (submitError) {
        await client().storage.from('campus-map-models').remove([path]).catch(() => {});
        throw submitError;
      }
      $('campus-map-profile-model-file').value = '';
      setStatus('3D model uploaded to private Staging storage and submitted for review. It will not appear on student maps until approved.', 'success');
      await loadCampus();
    } catch (error) {
      setStatus(error.message || 'The campus 3D model upload failed.', 'error');
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = 'Upload model for review';
    }
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
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 17.5), duration: motionDuration(450) });
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
    if (fly && map) map.flyTo({ center: [Number(item.longitude), Number(item.latitude)], zoom: 17, pitch: mapMode === '3d' ? 48 : 0, bearing: mapMode === '3d' ? -14 : 0, duration: motionDuration(600), essential: true });
  }

  function currentCampusFeatures() {
    const selected = $('campus-map-campus-select')?.value || 'main-campus';
    activeCampusProfile = campusProfiles.find(item => item.campus_slug === selected) || null;
    selectedFeature = null;
    features = allFeatures.filter(item => item.is_published && item.campus_slug === selected && item.latitude != null && item.longitude != null);
    adminDrafts = isCampusAdmin ? allFeatures.filter(item => !item.is_published && item.campus_slug === selected) : [];
    updateSource();
    updateDraftSource();
    renderFeatures();
    renderAdminDrafts();
    renderCampusProfileForm();
    updateCampusBoundarySource();
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

  function renderCampusProfileForm() {
    const panel = $('campus-map-profile-setup');
    if (panel) panel.hidden = !isCampusAdmin;
    const profile = activeCampusProfile;
    if (!$('campus-map-profile-name')) return;
    $('campus-map-profile-id').value = profile?.id || '';
    $('campus-map-profile-name').value = profile?.campus_name || 'Main Campus';
    $('campus-map-profile-slug').value = profile?.campus_slug || 'main-campus';
    $('campus-map-profile-state').value = profile?.state || campus?.state || '';
    $('campus-map-profile-lat').value = profile?.center_latitude ?? '';
    $('campus-map-profile-lng').value = profile?.center_longitude ?? '';
    $('campus-map-profile-source').value = profile?.center_source_url || '';
    $('campus-map-profile-verified').checked = profile?.center_status === 'verified';
    $('campus-map-profile-boundary').value = profile?.boundary_geojson ? JSON.stringify(profile.boundary_geojson, null, 2) : '';
    $('campus-map-profile-boundary-source').value = profile?.boundary_source_url || '';
    $('campus-map-profile-boundary-verified').checked = profile?.boundary_status === 'verified';
    $('campus-map-profile-model-attribution').value = profile?.model_attribution || '';
    if ($('campus-map-profile-model-status')) {
      const modelState = profile?.model_status || 'not_submitted';
      $('campus-map-profile-model-status').dataset.state = modelState;
      $('campus-map-profile-model-status').textContent = modelState === 'approved'
        ? 'Approved model recorded. Rendering remains gated on the 3D model review and renderer integration.'
        : modelState === 'pending_review'
          ? 'GLB model uploaded privately and awaiting review. It is not shown to students.'
          : modelState === 'rejected'
            ? 'Previous model was rejected. Submit a corrected university-supplied model.'
            : 'No 3D model submitted. A university-supplied GLB is required for realistic roofs and facades.';
    }
    if ($('campus-map-profile-coverage')) {
      $('campus-map-profile-coverage').textContent = profile
        ? `Centre: ${profile.center_status || 'missing'} · Boundary: ${profile.boundary_status || 'missing'} · Building data: ${profile.building_coverage_status || 'unassessed'} · 3D model: ${profile.model_status || 'not submitted'}`
        : 'No campus profile found. Create a profile to record this campus centre.';
    }
    if ($('campus-map-profile-status')) {
      const centreStatus = profile?.center_status || 'missing';
      const centreLabel = centreStatus === 'verified' ? 'verified campus centre' : centreStatus === 'official_locator' ? 'official campus locator' : centreStatus === 'candidate' ? 'candidate centre' : 'centre not mapped';
      $('campus-map-profile-status').textContent = `${profile?.campus_name || 'Main Campus'} · ${centreLabel} · boundary ${profile?.boundary_status || 'missing'} · buildings ${profile?.building_coverage_status || 'unassessed'}`;
    }
  }

  function renderCampusOptions() {
    const select = $('campus-map-campus-select');
    if (!select) return;
    const current = select.value || 'main-campus';
    const campuses = new Map();
    campusProfiles.forEach(item => campuses.set(item.campus_slug, item.campus_name));
    allFeatures.forEach(item => { if (!campuses.has(item.campus_slug)) campuses.set(item.campus_slug, item.campus_name); });
    if (!campuses.size) campuses.set('main-campus', 'Main Campus');
    select.innerHTML = [...campuses.entries()].map(([slug, name]) =>
      '<option value="' + esc(slug) + '">' + esc(name) + '</option>').join('');
    select.value = campuses.has(current) ? current : campuses.keys().next().value;
    activeCampusProfile = campusProfiles.find(item => item.campus_slug === select.value) || null;
    renderCampusProfileForm();
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
      const profileColumns = 'id,university_id,campus_name,campus_slug,state,location_hint,center_latitude,center_longitude,center_source_url,center_status,center_verified_by,center_verified_at,boundary_geojson,boundary_source_url,boundary_status,building_data_provider,building_coverage_status,model_format,model_status,metadata,is_active' + (isCampusAdmin ? ',model_storage_path,model_source_url,model_attribution' : '');
      const { data: profileRows, error: profileError } = await client().from('campus_map_campuses')
        .select(profileColumns)
        .eq('university_id', campus.university_id)
        .eq('is_active', true)
        .order('campus_name', { ascending: true });
      if (profileError) {
        console.warn('CampusMap profile directory is unavailable; using state-level fallback.', profileError);
        campusProfiles = [];
      } else {
        campusProfiles = profileRows || [];
      }
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
      await loadCampusBuildings();
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
    activeCampusProfile = campusProfiles.find(item => item.campus_slug === $('campus-map-campus-select').value) || null;
    renderCampusProfileForm();
    currentCampusFeatures();
    loadCampusBuildings().catch(error => console.warn('Campus building footprints unavailable.', error));
    incidentPins = [];
    loadIncidentPins().catch(error => console.warn('Incident pins unavailable.', error));
  });
  $('campus-map-profile-form')?.addEventListener('submit', event => {
    event.preventDefault();
    saveCampusProfile();
  });
  $('campus-map-profile-model-upload')?.addEventListener('click', uploadCampusGlbModel);
  $('campus-map-building-discover')?.addEventListener('click', discoverCampusBuildings);
  $('campus-map-building-candidates')?.addEventListener('click', event => {
    const button = event.target.closest('[data-review-building-id]');
    if (button) selectCampusBuildingForReview(button.dataset.reviewBuildingId);
  });
  $('campus-map-building-verify-save')?.addEventListener('click', () => reviewCampusBuilding('verified', false));
  $('campus-map-building-verify-publish')?.addEventListener('click', () => reviewCampusBuilding('verified', true));
  $('campus-map-building-reject')?.addEventListener('click', () => reviewCampusBuilding('rejected', false));
  $('campus-map-profile-new')?.addEventListener('click', () => {
    if (!isCampusAdmin) return;
    $('campus-map-profile-id').value = '';
    $('campus-map-profile-name').value = '';
    $('campus-map-profile-slug').value = '';
    $('campus-map-profile-state').value = campus?.state || '';
    $('campus-map-profile-lat').value = '';
    $('campus-map-profile-lng').value = '';
    $('campus-map-profile-source').value = '';
    $('campus-map-profile-verified').checked = false;
    $('campus-map-profile-name').focus();
  });
  $('campus-map-profile-pick')?.addEventListener('click', () => {
    if (!isCampusAdmin || !ensureMap()) return setStatus('Only a verified campus administrator can set the campus centre.', 'warning');
    profilePlacementMode = true;
    $('campus-map-profile-pick').classList.add('primary');
    map.getCanvas().style.cursor = 'crosshair';
    setStatus('Click the campus main gate or official campus reference point. This is the campus centre, not a building entrance.', 'info');
  });
  $('campus-map-profile-gps')?.addEventListener('click', () => {
    if (!isCampusAdmin) return setStatus('Only a verified campus administrator can set the campus centre.', 'warning');
    if (!navigator.geolocation) return setStatus('Device location is unavailable in this browser.', 'warning');
    setStatus('Stand at the campus main gate or campus reference point and allow GPS.', 'info');
    navigator.geolocation.getCurrentPosition(position => {
      setProfileCentreCoordinates(position.coords.latitude, position.coords.longitude, 'device GPS', position.coords.accuracy);
    }, () => setStatus('GPS permission was denied or the device could not determine the location.', 'warning'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
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
      map.flyTo({ center: coords, zoom: 17, pitch: mapMode === '3d' ? 48 : 0, duration: motionDuration(600) });
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
