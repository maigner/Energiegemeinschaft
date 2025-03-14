#!/bin/bash

psql "host=server user=ischlstrom_middleware dbname=ischlstrom_middleware sslmode=require" < middleware.dmp