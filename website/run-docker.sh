#!/bin/bash
# Host-Port ist ueberschreibbar: auf s1 laeuft openHAB Cloud bereits auf
# 3000, dort startet die Website unter 3001 (setzt deploy-server.sh).
docker run -d --restart always -p "${HOST_PORT:-3000}:8080" --name ischlstrom-website ischlstrom-website
