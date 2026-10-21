#!/bin/sh
# Starts clamd (it drops to the clamav user), refreshes old signatures in the
# background, then runs the toolbox as the unprivileged node user.
set -eu

mkdir -p /run/clamav
chown clamav:clamav /run/clamav

# The image carries signatures from build time. When they are older than 20 hours,
# fetch the daily update in the background; clamd reloads within the hour
# (SelfCheck). A failure keeps the image signatures and is logged.
if [ -n "$(find /var/lib/clamav -maxdepth 1 -name 'daily.c?d' -mmin +1200 2>/dev/null)" ]; then
  (freshclam --stdout --foreground --quiet || echo '{"event":"toolbox.freshclam_failed"}' >&2) &
fi

clamd &

exec runuser -u node -- node /app/src/server.mjs
