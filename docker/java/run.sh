#!/bin/bash
set -e
cd /workspace
javac -d /tmp /workspace/Main.java
timeout --kill-after=0.2s "${CODE_RUNNER_TIME_LIMIT_SECONDS:-10}s" java -Djava.io.tmpdir=/tmp -cp /tmp Main
