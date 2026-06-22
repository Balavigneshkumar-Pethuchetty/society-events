import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'https://auth.gm-global-techies-town.club',
  realm: 'society-events',
  clientId: 'society-frontend',
});

export default keycloak;
