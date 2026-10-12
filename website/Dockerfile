# Node 24 (LTS). node:23 war non-LTS und ist seit Juni 2026 ohne Updates.
FROM node:24

# Set timezone to Europe/Vienna (Salzburg)
# xz-utils + mtools: SD-Karten-Image-Bau (src/lib/server/ibmImage.js)
RUN apt-get update && apt-get install -y tzdata xz-utils mtools && \
    ln -fs /usr/share/zoneinfo/Europe/Vienna /etc/localtime && \
    echo "Europe/Vienna" > /etc/timezone && \
    dpkg-reconfigure -f noninteractive tzdata && \
    rm -rf /var/lib/apt/lists/*
ENV TZ=Europe/Vienna

WORKDIR /app

# Abhaengigkeiten exakt nach package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Quellen (ohne .env, node_modules, Exporte - siehe .dockerignore). Die
# Geheimnisse kommen zur Laufzeit: run-docker.sh haengt .env ein, dotenv
# laedt sie in "npm start", der Code liest sie ueber $env/dynamic/private.
COPY . .
RUN npm run build

# Image-Verzeichnis (Volume ischlstrom-images) dem Laufzeitbenutzer geben;
# ein bereits befuelltes Volume behaelt seine Rechte - einmalig auf s1:
#   docker run --rm -v ischlstrom-images:/v alpine chown -R 1000:1000 /v
RUN mkdir -p /var/lib/ischlstrom/images && chown -R node:node /var/lib/ischlstrom /app
USER node

EXPOSE 8080
CMD ["npm", "run", "start"]
