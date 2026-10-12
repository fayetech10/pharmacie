export const environment = {
  production: false,
  // En dev, l'app appelle '/api' (chemin relatif) : le dev-server proxifie vers le backend
  // local (voir proxy.conf.json + angular.json). Ça fonctionne en HTTP comme en HTTPS et
  // depuis une IP LAN (test caméra du scanner QR sur mobile), sans CORS ni mixed-content.
  // Prod : URL absolue dans environment.prod.ts.
  apiUrl: '/api',
  
};
