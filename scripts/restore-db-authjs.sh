#!/bin/bash

psql "host=server user=ischlstrom_authjs_website dbname=ischlstrom_authjs_website sslmode=require" < authjs-website.dmp