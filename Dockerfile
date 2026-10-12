FROM node:20-alpine AS builder
WORKDIR /app

# npm ci (et non npm install) : installe exactement le package-lock.json, sans
# le modifier. Deux builds du meme commit produisent le meme resultat.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Configuration « lan » et NON la configuration par defaut : « ng build » compile
# en configuration production, qui remplace environment.ts par environment.prod.ts
# et fige l'URL du backend Render. Le tableau de bord servi ici appellerait alors
# la PRODUCTION au lieu de la pile locale. « lan » garde apiUrl relatif (/api),
# proxifie vers la passerelle par nginx (cf. nginx.conf).
RUN npm run build:lan

FROM nginx:alpine
COPY --from=builder /app/dist/pharmacie-csu-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
