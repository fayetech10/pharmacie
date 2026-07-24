// Déploiement sur serveur local (LAN), frontend servi par nginx qui proxifie /api
// vers le backend Spring Boot en localhost:8080 (cf. nginx.conf).
//
// apiUrl relatif : frontend et API partagent la même origine, donc ni CORS ni
// contenu mixte. Le même build fonctionne en HTTP comme en HTTPS, par IP comme
// par nom de domaine — rien n'est figé à la compilation.
//
// Build : npm run build:lan   →   dist/pharmacie-csu-frontend/browser
// Ne pas confondre avec environment.prod.ts, réservé au déploiement Render
// (URL absolue, car le frontend y est hébergé sur un domaine distinct du backend).
export const environment = {
  production: true,
  apiUrl: '/api',
};
