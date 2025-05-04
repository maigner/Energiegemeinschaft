#!/bin/bash

docker build --no-cache -t ischlstrom-website .
docker stop ischlstrom-website
docker rm ischlstrom-website
./run-docker.sh 