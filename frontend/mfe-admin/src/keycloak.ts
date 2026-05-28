import Keycloak from 'keycloak-js';

const isLocalDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isStandaloneAdminDev = isLocalDevHost && ['4004', '4005'].includes(window.location.port);

const keycloakUrl = isStandaloneAdminDev
  ? window.location.origin
  : isLocalDevHost && window.location.port !== '8080'
  ? `${window.location.protocol}//${window.location.hostname}:8080`
  : window.location.origin;

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'society-events',
  clientId: 'society-frontend',
});

export default keycloak;
