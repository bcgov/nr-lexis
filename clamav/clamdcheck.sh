#!/usr/bin/env sh
set -eu

printf 'zPING\0' | nc -w 5 127.0.0.1 3310 | grep -q PONG
