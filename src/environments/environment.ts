export const environment = {
  production: false,
  // Dev local : pointe vers le backend lancé en local (profil H2). La prod utilise
  // environment.prod.ts (onrender) via le fileReplacement de la config production.
  apiUrl: 'http://localhost:8080/api'
};
 