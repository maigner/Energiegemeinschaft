#!/bin/bash
# Host-Port ist ueberschreibbar: auf s1 laeuft openHAB Cloud bereits auf
# 3000, dort startet die Website unter 3001 (setzt deploy-server.sh).
# Volume ischlstrom-images: fertige SD-Karten-Images (ibmImage.js) samt
# Basis-Image-Cache - ueberlebt den Container-Neubau beim Deploy.
docker run -d --restart always -p "${HOST_PORT:-3000}:8080" \
    -v ischlstrom-images:/var/lib/ischlstrom/images \
    --name ischlstrom-website ischlstrom-website
