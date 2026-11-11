(function attachCampusMapNavigation(root) {
  'use strict';

  function hasValidCoordinates(feature) {
    if (!feature || feature.longitude == null || feature.latitude == null) return false;
    if (typeof feature.longitude === 'string' && !feature.longitude.trim()) return false;
    if (typeof feature.latitude === 'string' && !feature.latitude.trim()) return false;
    const longitude = Number(feature.longitude);
    const latitude = Number(feature.latitude);
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      && longitude >= -180 && longitude <= 180
      && latitude >= -90 && latitude <= 90;
  }

  function resolveRouteTarget(selectedFeature, features, accessibleOnly) {
    if (!hasValidCoordinates(selectedFeature)) return null;

    if (selectedFeature.feature_type === 'accessible_entry') return selectedFeature;
    if (selectedFeature.feature_type === 'entrance') {
      if (accessibleOnly && selectedFeature.metadata?.entry_type !== 'accessible') return null;
      return selectedFeature;
    }

    const publishedFeatures = Array.isArray(features) ? features : [];
    const linkedEntrances = publishedFeatures.filter(feature =>
      ['entrance', 'accessible_entry'].includes(feature?.feature_type)
      && feature.metadata?.building_feature_id === selectedFeature.id
      && hasValidCoordinates(feature)
    );
    const accessibleEntrance = linkedEntrances.find(feature =>
      feature.feature_type === 'accessible_entry'
      && feature.metadata?.entry_type === 'accessible'
    );

    if (accessibleOnly) return accessibleEntrance || null;

    return linkedEntrances.find(feature =>
      feature.feature_type === 'entrance' && feature.metadata?.entry_type === 'main'
    ) || linkedEntrances.find(feature => feature.feature_type === 'entrance')
      || accessibleEntrance || selectedFeature;
  }

  function describeRouteTarget(selectedFeature, target, accessibleOnly) {
    if (!target) return accessibleOnly
      ? 'No verified accessible entrance with usable coordinates is recorded.'
      : 'No published entrance with usable coordinates is recorded.';
    const metadata = target.metadata && typeof target.metadata === 'object' ? target.metadata : {};
    const isAccessible = target.feature_type === 'accessible_entry' || metadata.entry_type === 'accessible';
    const verification = target.verification_status === 'verified' ? 'Verified' : 'Published';

    if (target.id === selectedFeature?.id) {
      if (target.feature_type === 'entrance' || target.feature_type === 'accessible_entry') {
        return verification + (isAccessible ? ' accessible entrance: ' : ' entrance: ') + target.name;
      }
      return 'Campus location marker: ' + target.name + ' (no separate mapped entrance is recorded)';
    }

    const entryLabel = isAccessible
      ? ' accessible entrance'
      : metadata.entry_type === 'main' ? ' main entrance' : ' entrance';
    return verification + entryLabel + ': ' + target.name;
  }

  root.CampusMapNavigation = Object.freeze({
    hasValidCoordinates,
    resolveRouteTarget,
    describeRouteTarget
  });
})(window);
