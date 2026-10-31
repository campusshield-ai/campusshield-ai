(() => {
  'use strict';
  const root = document.getElementById('campus-map-page');
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
  let campus = null;
  let selectedFeature = null;
  let userMarker = null;
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
      center: [3.72, 6.89],
      zoom: 5.2,
      pitch: 0,
      bearing: 0,
      maxPitch: 65,
      attributionControl: true
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
          'text-size': 11,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: { 'text-color': '#15343a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
      });
      map.on('click', 'campus-feature-points', event => {
        const id = event.features?.[0]?.properties?.id;
        const feature = features.find(item => item.id === id);
        if (feature) selectFeature(feature, true);
      });
      map.on('mouseenter', 'campus-feature-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'campus-feature-points', () => { map.getCanvas().style.cursor = ''; });
      updateSource();
    });
    return map;
  }

  function featureCollection(items) {
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(item.longitude), Number(item.latitude)] },
        properties: { id: item.id, name: item.name, feature_type: item.feature_type }
      }))
    };
  }

  function updateSource() {
    const source = map?.getSource('campus-features');
    if (source) source.setData(featureCollection(features));
  }

  function fitCampus() {
    if (!map) return;
    if (features.length === 1) {
      map.flyTo({ center: [Number(features[0].longitude), Number(features[0].latitude)], zoom: 16 });
    } else if (features.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      features.forEach(item => bounds.extend([Number(item.longitude), Number(item.latitude)]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 700 });
    } else if (campus?.slug === 'babcock-university') {
      // Approximate campus centre only; exact boundaries/building coordinates require verified mapping.
      map.flyTo({ center: [3.72, 6.89], zoom: 14 });
    }
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
    setStatus(item.name + (item.description ? ' — ' + item.description : ''));
    if (fly && map) map.flyTo({ center: [Number(item.longitude), Number(item.latitude)], zoom: 17, pitch: 45, essential: true });
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
      const { data, error } = await client().from('campus_map_features')
        .select('id, university_id, feature_type, name, description, latitude, longitude, metadata')
        .eq('university_id', campus.university_id)
        .eq('is_published', true)
        .order('name', { ascending: true })
        .limit(500);
      if (error) throw error;
      features = data || [];
      updateSource();
      renderFeatures();
      fitCampus();
      setStatus(features.length
        ? features.length + ' verified campus locations loaded.'
        : 'The map is ready. This university has no verified locations published yet.', 'info');
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
    renderFeatures(matches);
    results.hidden = !term;
    if (matches.length === 1) selectFeature(matches[0], true);
  }

  search?.addEventListener('input', () => filterFeatures(search.value));
  featureList?.addEventListener('click', event => {
    const button = event.target.closest('[data-feature-id]');
    if (!button) return;
    const item = features.find(feature => feature.id === button.dataset.featureId);
    if (item) selectFeature(item, true);
  });

  $('campus-map-2d')?.addEventListener('click', () => {
    if (map) map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    $('campus-map-2d').classList.add('active');
    $('campus-map-3d').classList.remove('active');
  });
  $('campus-map-3d')?.addEventListener('click', () => {
    if (map) map.easeTo({ pitch: 55, bearing: -18, duration: 650 });
    $('campus-map-3d').classList.add('active');
    $('campus-map-2d').classList.remove('active');
    setStatus('Tilted 3D-style view enabled. Detailed 3D building models require verified building geometry.');
  });

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

  const observer = new MutationObserver(() => {
    if (root.classList.contains('active')) {
      if (!map) ensureMap();
      else map.resize();
      if (!campus && client()) loadCampus();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });

  // Initialise lazily when the map page is opened, keeping initial app load light.
  document.addEventListener('click', event => {
    if (event.target.closest('[data-page="campus-map"]')) {
      if (!map) ensureMap();
      else map.resize();
      if (!campus) loadCampus();
    }
  });

  window.CampusShieldCampusMap = { refresh: loadCampus };
})();
