import Keycloak from 'keycloak-js';

// When served by the Vite dev server (port 3000), Keycloak/nginx is on port
// 8080 of the same host. For all other deployments — nginx directly, LAN
// access, or a public tunnel — Keycloak shares the same origin as the app.
const keycloakUrl = window.location.port === '3000'
  ? `${window.location.protocol}//${window.location.hostname}:8080`
  : window.location.origin;

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'society-events',
  clientId: 'society-frontend',
});

export default keycloak;
