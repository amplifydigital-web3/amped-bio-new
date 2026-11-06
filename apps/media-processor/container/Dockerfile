# Media toolbox image for the processor Worker (content system PR 4, spec 3.5).
# Built and pushed by `wrangler deploy` from apps/media-processor. Needs Docker on
# the machine that deploys. Handoff: docs/fixes/content-media-processor.md.
#
# Debian bookworm packages: ffmpeg 5.1, ClamAV 1.0 LTS, poppler 22.12, qpdf 11.3,
# libheif 1.15. sharp brings its own libvips.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    clamav \
    clamav-daemon \
    clamdscan \
    clamav-freshclam \
    ffmpeg \
    libheif-examples \
    poppler-utils \
    qpdf \
    tini \
    unzip \
  && rm -rf /var/lib/apt/lists/*

COPY clamav/clamd.conf /etc/clamav/clamd.conf
COPY clamav/freshclam.conf /etc/clamav/freshclam.conf

# Signatures are baked in at build time, so a fresh container scans at once.
# Redeploy at least weekly; the entrypoint also refreshes them when they are old.
RUN mkdir -p /run/clamav /var/lib/clamav \
  && chown clamav:clamav /run/clamav /var/lib/clamav \
  && freshclam --stdout --foreground

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

ENV NODE_ENV=production \
  PORT=8080 \
  CLAMAV_MODE=clamd \
  CLAMD_SOCKET=/run/clamav/clamd.ctl

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
