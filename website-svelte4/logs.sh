#!/bin/bash

eb logs --profile ischlstrom-admin -g /aws/elasticbeanstalk/ischlstrom-website-dev/var/log/web.stdout.log --stream
