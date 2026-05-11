import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'society-events',
  clientId: 'society-frontend',
});

export default keycloak;
