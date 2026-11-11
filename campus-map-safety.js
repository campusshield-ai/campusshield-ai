(function attachCampusMapSafety(root) {
  'use strict';

  const SAFETY_TYPES = Object.freeze({
    security: 'Security post',
    medical: 'Medical service',
    gate: 'Campus gate',
    assembly_point: 'Assembly point',
    emergency_point: 'Emergency point'
  });
  const EARTH_RADIUS_METERS = 6371008.8;

  function validCoordinates(value) {
    if (!value || value.longitude == null || value.latitude == null) return false;
    if (typeof value.longitude === 'string' && !value.longitude.trim()) return false;
    if (typeof value.latitude === 'string' && !value.latitude.trim()) return false;
    const longitude = Number(value.longitude);
    const latitude = Number(value.latitude);
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      && longitude >= -180 && longitude <= 180
      && latitude >= -90 && latitude <= 90;
  }

  function distanceMeters(origin, destination) {
    if (!validCoordinates(origin) || !validCoordinates(destination)) return null;
    const toRadians = degrees => degrees * Math.PI / 180;
    const lat1 = toRadians(Number(origin.latitude));
    const lat2 = toRadians(Number(destination.latitude));
    const deltaLat = lat2 - lat1;
    const deltaLon = toRadians(Number(destination.longitude) - Number(origin.longitude));
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return EARTH_RADIUS_METERS * centralAngle;
  }

  function rankNearbyFacilities(items, origin, limit = 6) {
    if (!validCoordinates(origin) || !Array.isArray(items)) return [];
    const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 20)) : 6;
    return items
      .filter(item => item?.is_published === true
        && Object.prototype.hasOwnProperty.call(SAFETY_TYPES, item.feature_type)
        && validCoordinates(item))
      .map(feature => ({
        feature,
        distance_meters: distanceMeters(origin, feature)
      }))
      .filter(result => Number.isFinite(result.distance_meters))
      .sort((a, b) => a.distance_meters - b.distance_meters
        || String(a.feature.name || '').localeCompare(String(b.feature.name || '')))
      .slice(0, safeLimit);
  }

  root.CampusMapSafety = Object.freeze({
    types: SAFETY_TYPES,
    validCoordinates,
    distanceMeters,
    rankNearbyFacilities
  });
})(window);
