#!/bin/bash

pg_dump \
    -h postgres-01.c7wwq066awn1.eu-central-1.rds.amazonaws.com \
	-U middleware \
	-d middleware \
	> middleware.dmp