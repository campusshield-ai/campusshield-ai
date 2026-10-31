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
      center: [3.7191259, 6.8910932],
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

      const maptilerKey = window.CampusShieldMapConfig?.maptilerKey;
      if (typeof maptilerKey === 'string' && maptilerKey.trim()) {
        const key = encodeURIComponent(maptilerKey.trim());
        map.addSource('campus-satellite', {
          type: 'raster',
          url: 'https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=' + key,
          tileSize: 512,
          attribution: '© MapTiler © OpenStreetMap contributors'
        });
        map.addLayer({ id: 'campus-satellite-layer', type: 'raster', source: 'campus-satellite', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.96 } }, 'campus-feature-points');
        map.addSource('campus-terrain', {
          type: 'raster-dem',
          url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=' + key,
          tileSize: 512,
          maxzoom: 14,
          encoding: 'mapbox'
        });
        map.addSource('campus-buildings', {
          type: 'vector',
          url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=' + key,
          minzoom: 12,
          maxzoom: 18
        });
        map.addLayer({
          id: 'campus-3d-buildings',
          type: 'fill-extrusion',
          source: 'campus-buildings',
          'source-layer': 'building',
          minzoom: 14,
          filter: ['!', ['has', 'hide_3d']],
          paint: {
            'fill-extrusion-color': '#9eb9ac',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.86
          }
        }, 'campus-feature-points');
        $('campus-map-satellite')?.classList.add('available');
      } else {
        setStatus('For satellite imagery and 3D building footprints, configure a domain-restricted MapTiler key in CampusShieldMapConfig.', 'info');
      }
      map.on('click', 'campus-feature-points', event => {
        const id = event.features?.[0]?.properties?.id;
        const feature = features.find(item => item.id === id);
        if (feature) selectFeature(feature, true);
      });
      map.on('mouseenter', 'campus-feature-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'campus-feature-points', () => { map.getCanvas().style.cursor = ''; });
      updateSource();
      updateIncidentSource();
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

  function fitCampus() {
    if (!map) return;
    if (features.length && campusCenterMarker) { campusCenterMarker.remove(); campusCenterMarker = null; }
    if (features.length === 1) {
      map.flyTo({ center: [Number(features[0].longitude), Number(features[0].latitude)], zoom: 16 });
    } else if (features.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      features.forEach(item => bounds.extend([Number(item.longitude), Number(item.latitude)]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 700 });
    } else if (campus?.university_slug === 'babcock-university' && ($('campus-map-campus-select')?.value || 'main-campus') === 'main-campus') {
      // Coordinates come from the official university contact page's Google Maps embed.
      // This is a campus locator, not a verified building entrance or individual facility pin.
      const center = [3.7191259, 6.8910932];
      map.flyTo({ center, zoom: 15 });
      if (!campusCenterMarker) {
        campusCenterMarker = new maplibregl.Marker({ color: '#087f75' })
          .setLngLat(center)
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText('Babcock University — official campus locator, not a building pin'))
          .addTo(map);
      } else campusCenterMarker.setLngLat(center);
    } else if (campusCenterMarker) {
      campusCenterMarker.remove();
      campusCenterMarker = null;
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
    const emergencyLine = item.metadata?.emergency_phone ? ' Emergency line: ' + item.metadata.emergency_phone + '.' : '';
    setStatus(item.name + (item.description ? ' — ' + item.description : '') + emergencyLine);
    if (fly && map) map.flyTo({ center: [Number(item.longitude), Number(item.latitude)], zoom: 17, pitch: 45, essential: true });
  }

  function currentCampusFeatures() {
    const selected = $('campus-map-campus-select')?.value || 'main-campus';
    selectedFeature = null;
    features = allFeatures.filter(item => item.is_published && item.campus_slug === selected && item.latitude != null && item.longitude != null);
    adminDrafts = isCampusAdmin ? allFeatures.filter(item => !item.is_published && item.campus_slug === selected) : [];
    updateSource();
    renderFeatures();
    renderAdminDrafts();
    fitCampus();
  }

  function renderAdminDrafts() {
    const host = $('campus-map-admin-drafts');
    if (!host) return;
    host.innerHTML = adminDrafts.length ? adminDrafts.map(item => `
      <div class="campus-map-admin-draft">
        <span><strong>${esc(item.name)}</strong><small>${esc(item.verification_status || 'pending')} · ${item.latitude == null ? 'coordinates missing' : 'coordinates saved'}</small></span>
        <button type="button" data-edit-map-id="${esc(item.id)}">Edit</button>
      </div>`).join('') : '<p class="campus-map-empty">No draft locations for this campus.</p>';
  }

  function resetAdminForm() {
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
    $('campus-map-admin-source').value = item.source_url || '';
    $('campus-map-admin-verified').checked = item.verification_status === 'verified';
    $('campus-map-admin-publish').checked = !!item.is_published;
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
    renderFeatures(matches);
    results.hidden = !term;
    if (matches.length === 1) selectFeature(matches[0], true);
  }

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
    try {
      const { error } = await client().rpc('manage_campus_map_feature', payload);
      if (error) throw error;
      resetAdminForm();
      setStatus('Campus location saved. Published locations are now available to this university only.', 'success');
      await loadCampus();
    } catch (error) {
      setStatus(error.message || 'Could not save this campus location.', 'error');
    }
  });
  $('campus-map-admin-reset')?.addEventListener('click', resetAdminForm);
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
  $('campus-map-satellite')?.addEventListener('click', () => {
    if (!map?.getLayer('campus-satellite-layer')) {
      setStatus('Satellite imagery needs a domain-restricted MapTiler key in CampusShieldMapConfig.', 'warning');
      return;
    }
    const visible = map.getLayoutProperty('campus-satellite-layer', 'visibility') === 'visible';
    map.setLayoutProperty('campus-satellite-layer', 'visibility', visible ? 'none' : 'visible');
    $('campus-map-satellite').classList.toggle('active', !visible);
    setStatus(visible ? 'Satellite imagery hidden.' : 'Satellite imagery enabled.');
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

  $('campus-map-2d')?.addEventListener('click', () => {
    if (map) { map.easeTo({ pitch: 0, bearing: 0, duration: 500 }); if (map.getTerrain()) map.setTerrain(null); }
    $('campus-map-2d').classList.add('active');
    $('campus-map-3d').classList.remove('active');
  });
  $('campus-map-3d')?.addEventListener('click', () => {
    if (map) { map.easeTo({ pitch: 55, bearing: -18, duration: 650 }); if (map.getSource('campus-terrain')) map.setTerrain({ source: 'campus-terrain', exaggeration: 1.15 }); }
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

  window.CampusShieldCampusMap = { refresh: loadCampus, reloadIncidents: loadIncidentPins };
})();
