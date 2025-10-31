FROM mcr.microsoft.com/devcontainers/base:ubuntu

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    xvfb libnss3 \
    && rm -rf /var/lib/apt/lists/*
