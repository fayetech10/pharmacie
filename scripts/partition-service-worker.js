const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.resolve(process.argv[2] || 'dist/pharmacie-csu-frontend/browser');
const manifestPath = path.join(outputDirectory, 'ngsw.json');
const indexPath = path.join(outputDirectory, 'index.html');

if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) {
  console.log('Service worker absent : aucune partition des chunks à appliquer.');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const html = fs.readFileSync(indexPath, 'utf8');
const applicationGroup = manifest.assetGroups.find(group => group.name === 'application');

if (!applicationGroup || !Array.isArray(applicationGroup.urls)) {
  throw new Error('Le groupe « application » est introuvable dans ngsw.json.');
}

const isJavaScript = url => /\.m?js(?:[?#].*)?$/i.test(url);
const toAppUrl = value => new URL(value, 'https://app.invalid/').pathname;
const entryPoints = new Set();

for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
  if (!/\brel\s*=\s*["']modulepreload["']/i.test(tag)) continue;
  const href = tag.match(/\bhref\s*=\s*["']([^"']+\.m?js(?:[?#][^"']*)?)["']/i)?.[1];
  if (href) entryPoints.add(toAppUrl(href));
}

for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
  const source = tag.match(/\bsrc\s*=\s*["']([^"']+\.m?js(?:[?#][^"']*)?)["']/i)?.[1];
  if (source) entryPoints.add(toAppUrl(source));
}

const deferredGroupName = 'modules-differes';
const existingDeferredGroup = manifest.assetGroups.find(group => group.name === deferredGroupName);
const allJavaScript = [...new Set([
  ...applicationGroup.urls.filter(isJavaScript),
  ...(existingDeferredGroup?.urls || []).filter(isJavaScript)
])];
const unmatchedEntryPoints = [...entryPoints].filter(url => !allJavaScript.includes(url));
if (unmatchedEntryPoints.length) {
  throw new Error(`Des scripts du shell ne sont pas couverts par le groupe application : ${unmatchedEntryPoints.join(', ')}`);
}

const deferredScripts = allJavaScript.filter(url => !entryPoints.has(url));
applicationGroup.urls = applicationGroup.urls.filter(url => !isJavaScript(url) || entryPoints.has(url));

const deferredGroup = {
  name: deferredGroupName,
  installMode: 'lazy',
  updateMode: 'lazy',
  cacheQueryOptions: applicationGroup.cacheQueryOptions,
  urls: deferredScripts,
  patterns: []
};

const existingGroupIndex = manifest.assetGroups.findIndex(group => group.name === deferredGroupName);
if (existingGroupIndex >= 0) {
  manifest.assetGroups[existingGroupIndex] = deferredGroup;
} else {
  const applicationIndex = manifest.assetGroups.indexOf(applicationGroup);
  manifest.assetGroups.splice(applicationIndex + 1, 0, deferredGroup);
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const deferredBytes = deferredScripts.reduce((sum, url) => {
  const filePath = path.join(outputDirectory, ...url.split('/').filter(Boolean));
  return sum + fs.statSync(filePath).size;
}, 0);
console.log(`Service worker : ${entryPoints.size} scripts du shell préchargés ; ${deferredScripts.length} chunks de routes (${(deferredBytes / 1024 / 1024).toFixed(2)} Mo bruts) chargés à la demande.`);
