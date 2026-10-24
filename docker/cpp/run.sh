#!/bin/bash
set -e
g++ -o /tmp/app /workspace/source.cpp
timeout --kill-after=0.2s "${CODE_RUNNER_TIME_LIMIT_SECONDS:-10}s" /tmp/app
