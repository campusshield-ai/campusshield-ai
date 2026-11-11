/* Public MapTiler browser key configuration.
 * Only use a key restricted to the CampusShield domains in the MapTiler dashboard.
 * Never place a secret/server key here.
 */
window.CampusShieldMapConfig = window.CampusShieldMapConfig || {};
window.CampusShieldMapConfig.maptilerKey = window.CampusShieldMapConfig.maptilerKey || '';

/* Configurable HTTPS MapLibre style URL. Keep the no-key pilot style by default. */
window.CampusShieldMapConfig.baseStyleUrl = window.CampusShieldMapConfig.baseStyleUrl || 'https://tiles.openfreemap.org/styles/liberty';

/* Private GLB model storage and submission are not part of this Production release. */
window.CampusShieldMapConfig.privateModelUploadsEnabled = false;
