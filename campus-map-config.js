/* Public MapTiler browser key configuration.
 * Only use a key restricted to the CampusShield domains in the MapTiler dashboard.
 * Never place a secret/server key here.
 */
window.CampusShieldMapConfig = window.CampusShieldMapConfig || {};
window.CampusShieldMapConfig.maptilerKey = window.CampusShieldMapConfig.maptilerKey || '';

/* OpenFreeMap Liberty is the no-key pilot style. Replace with an HTTPS
 * MapLibre-compatible style URL from an SLA-backed provider or your own PMTiles
 * hosting when the production service level requires it.
 */
window.CampusShieldMapConfig.baseStyleUrl = window.CampusShieldMapConfig.baseStyleUrl || 'https://tiles.openfreemap.org/styles/liberty';
