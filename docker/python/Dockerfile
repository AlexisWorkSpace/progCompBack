FROM python:3.10
COPY run.py /run.py
ENTRYPOINT ["/bin/sh", "-c", "exec timeout --kill-after=0.2s \"${CODE_RUNNER_TIME_LIMIT_SECONDS:-10}s\" python3 /run.py"]
