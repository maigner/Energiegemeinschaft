#!/bin/bash

npm run build

rm -rf eeg-website.zip
zip eeg-website.zip -r build
zip eeg-website.zip -r node_modules
zip eeg-website.zip .ebextensions
zip eeg-website.zip package.json
zip eeg-website.zip package-lock.json

# get the latest git hash and deploy
#eb deploy --staged -l `git rev-parse --short HEAD 2> /dev/null | sed "s/\(.*\)/\1/"`