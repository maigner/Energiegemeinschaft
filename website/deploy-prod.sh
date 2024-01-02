#!/bin/bash

npm run build

rm -rf ischlstrom-website-package.zip
zip -q ischlstrom-website-package.zip -r build
zip -q ischlstrom-website-package.zip -r node_modules
zip -q ischlstrom-website-package.zip .ebextensions
zip -q ischlstrom-website-package.zip global-bundle.pem
zip -q ischlstrom-website-package.zip package.json
zip -q ischlstrom-website-package.zip package-lock.json

# get the latest git hash and deploy
eb deploy --profile ischlstrom-admin --staged -l `git rev-parse --short HEAD 2> /dev/null | sed "s/\(.*\)/\1/"`
