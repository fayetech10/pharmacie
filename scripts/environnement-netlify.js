// Écrit src/environments/environment.netlify.ts à partir de la variable API_URL,
// renseignée dans Netlify (Site configuration → Environment variables) ou dans
// Vercel (Settings → Environment Variables) : les deux hébergeurs lancent ce build.
//
// Le tableau de bord est servi par Netlify et l'API par le VPS : deux origines
// distinctes, l'URL de l'API doit donc être ABSOLUE. Elle n'est pas écrite en dur
// dans le dépôt : changer de serveur = changer la variable dans Netlify et
// redéployer, sans commit.
//
//   API_URL=https://api.sencsu.sn npm run build:netlify
//
// « https://api.sencsu.sn » et « https://api.sencsu.sn/api » sont acceptés.
const fs = require('fs');
const path = require('path');

function echec(message) {
  console.error(`\n[build:netlify] ${message}\n`);
  process.exit(1);
}

const brute = (process.env.API_URL || '').trim().replace(/\/+$/, '');
if (!brute) {
  echec('API_URL absente. Dans Netlify (Site configuration → Environment variables) ou '
    + 'Vercel (Settings → Environment Variables) : API_URL = https://api.votre-domaine '
    + '(adresse HTTPS du VPS).');
}

let adresse;
try {
  adresse = new URL(brute);
} catch {
  echec(`API_URL invalide : « ${brute} ».`);
}
// Netlify sert le site en https : le navigateur bloque tout appel vers une API en
// http (contenu mixte). Mieux vaut échouer ici qu'avec un écran de connexion muet.
if (adresse.protocol !== 'https:') {
  echec(`API_URL doit commencer par https:// (reçu « ${brute} »).`);
}

const apiUrl = brute.endsWith('/api') ? brute : `${brute}/api`;
const cible = path.join(__dirname, '..', 'src', 'environments', 'environment.netlify.ts');

fs.writeFileSync(cible,
  '// FICHIER GÉNÉRÉ par scripts/environnement-netlify.js — ne pas modifier ni versionner.\n'
  + 'export const environment = {\n'
  + '  production: true,\n'
  + `  apiUrl: ${JSON.stringify(apiUrl)},\n`
  + '};\n');

console.log(`[build:netlify] apiUrl = ${apiUrl}`);
