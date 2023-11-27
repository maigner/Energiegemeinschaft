#!/bin/bash

rm -rf grails-app/migrations/changelog.groovy
./gradlew runCommand -Pargs="dbm-gorm-diff changelog.groovy" -Dgrails.env="dev"