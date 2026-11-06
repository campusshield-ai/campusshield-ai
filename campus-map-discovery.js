/*
 * Pure filtering and discovery helpers for the CampusMap facility directory.
 * Counts and matches are always calculated from the caller's campus-scoped
 * published features; this module never loads records or changes permissions.
 */
(() => {
  'use strict';

  const FEATURE_TYPES = Object.freeze([
    { type: 'building', label: 'Buildings', aliases: ['building', 'block', 'office'] },
    { type: 'lecture_hall', label: 'Lecture halls', aliases: ['lecture hall', 'lecture theatre', 'classroom', 'auditorium'] },
    { type: 'hostel', label: 'Hostels', aliases: ['hostel', 'residence', 'hall of residence', 'dormitory'] },
    { type: 'library', label: 'Libraries', aliases: ['library', 'reading room', 'research centre', 'research center'] },
    { type: 'cafeteria', label: 'Cafeterias', aliases: ['cafeteria', 'canteen', 'food court', 'food service'] },
    { type: 'medical', label: 'Medical services', aliases: ['medical', 'clinic', 'hospital', 'health centre', 'health center', 'first aid'] },
    { type: 'security', label: 'Security posts', aliases: ['security', 'security post', 'police post', 'campus safety'] },
    { type: 'gate', label: 'Gates', aliases: ['gate', 'campus gate', 'main gate'] },
    { type: 'parking', label: 'Parking', aliases: ['parking', 'car park', 'vehicle parking'] },
    { type: 'sports', label: 'Sports facilities', aliases: ['sports', 'sport', 'field', 'court', 'gym', 'gymnasium'] },
    { type: 'facility', label: 'Other facilities', aliases: ['facility', 'facilities', 'student services'] },
    { type: 'assembly_point', label: 'Assembly points', aliases: ['assembly point', 'muster point', 'rally point'] },
    { type: 'entrance', label: 'Entrances', aliases: ['entrance', 'entry', 'doorway'] },
    { type: 'accessible_entry', label: 'Accessible entrances', aliases: ['accessible entrance', 'wheelchair access', 'step free access', 'ramp'] },
    { type: 'emergency_point', label: 'Emergency points', aliases: ['emergency point', 'emergency location', 'emergency assembly'] }
  ]);

  const CATEGORY_TYPES = Object.freeze({
    academic: Object.freeze(['building', 'lecture_hall', 'library']),
    residential: Object.freeze(['hostel']),
    services: Object.freeze(['cafeteria', 'facility', 'parking', 'sports']),
    access: Object.freeze(['entrance', 'accessible_entry']),
    emergency: Object.freeze(['security', 'medical', 'assembly_point', 'emergency_point', 'gate'])
  });

  const byType = new Map(FEATURE_TYPES.map(item => [item.type, item]));

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replaceAll('_', ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function labelFor(type) {
    return byType.get(String(type || ''))?.label
      || String(type || 'Other locations').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  function matchesCategory(item, category = 'all') {
    if (category === 'all' || !category) return true;
    if (category === 'access') {
      return ['entrance', 'accessible_entry'].includes(item?.feature_type)
        || (Array.isArray(item?.metadata?.accessibility_features) && item.metadata.accessibility_features.length > 0);
    }
    const allowed = CATEGORY_TYPES[category];
    return Array.isArray(allowed) && allowed.includes(item?.feature_type);
  }

  function matchesType(item, type = 'all') {
    return !type || type === 'all' || item?.feature_type === type;
  }

  function metadataValues(value, depth = 0) {
    if (depth > 3 || value == null) return [];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(item => metadataValues(item, depth + 1));
    if (typeof value === 'object') return Object.values(value).flatMap(item => metadataValues(item, depth + 1));
    return [];
  }

  function matchesSearch(item, query) {
    const term = normalize(query);
    if (!term) return true;
    const type = byType.get(item?.feature_type);
    const values = [
      item?.name, item?.feature_type, type?.label, ...(type?.aliases || []),
      item?.description, item?.category, item?.location, item?.campus_name,
      item?.metadata
    ];
    const searchable = normalize(values.flatMap(value =>
      value && typeof value === 'object' ? metadataValues(value) : [value]
    ).join(' '));
    return term.split(' ').filter(Boolean).every(token => searchable.includes(token));
  }

  function getTypeCounts(items, category = 'all') {
    const counts = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!item?.feature_type || !matchesCategory(item, category)) return;
      counts.set(item.feature_type, (counts.get(item.feature_type) || 0) + 1);
    });
    return FEATURE_TYPES
      .filter(item => counts.has(item.type))
      .map(item => ({ type: item.type, label: item.label, count: counts.get(item.type) }));
  }

  window.CampusMapDiscovery = Object.freeze({
    featureTypes: FEATURE_TYPES,
    matchesCategory,
    matchesType,
    matchesSearch,
    getTypeCounts,
    labelFor,
    normalize
  });
})();
