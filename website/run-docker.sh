#!/bin/bash
# Host-Port ist ueberschreibbar: auf s1 laeuft openHAB Cloud bereits auf
# 3000, dort startet die Website unter 3001 (setzt deploy-server.sh).
# Volume ischlstrom-images: fertige SD-Karten-Images (ibmImage.js) samt
# Basis-Image-Cache - ueberlebt den Container-Neubau beim Deploy.
# Nur auf 127.0.0.1 veroeffentlichen: Docker-Ports gehen an ufw vorbei, und
# die Website vertraut hinter Caddy den X-Forwarded-*-Headern - direkt aus
# dem Internet erreichbar waere der Port ein Weg, Login-Links auf fremde
# Hosts umzubiegen (Security-Audit 2026-10-11). Caddy proxyt auf localhost.
# .env wird zur Laufzeit eingehaengt (dotenv in "npm start"), nicht ins
# Image kopiert.
docker run -d --restart always -p "127.0.0.1:${HOST_PORT:-3000}:8080" \
    -v "$(pwd)/.env:/app/.env:ro" \
    -v ischlstrom-images:/var/lib/ischlstrom/images \
    --name ischlstrom-website ischlstrom-website
