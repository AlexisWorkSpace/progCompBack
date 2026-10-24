#!/bin/bash
set -e
gcc -o /tmp/app /workspace/source.c
timeout --kill-after=0.2s "${CODE_RUNNER_TIME_LIMIT_SECONDS:-10}s" /tmp/app
