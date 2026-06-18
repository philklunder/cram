#!/bin/sh
# Boot the Cram backend container: render the nginx config with the runtime port,
# start uvicorn on loopback, then run nginx in the foreground as PID 1's child.
set -e

# Railway assigns the public port via $PORT; default matches the Dockerfile for local runs.
: "${PORT:=8080}"
export PORT

# Render the M1 proxy config with the runtime $PORT (the only variable substituted).
envsubst '${PORT}' < /app/deploy/nginx.conf.template > /etc/nginx/conf.d/cram.conf

# uvicorn binds loopback only — nginx is the sole public listener (M1 holds).
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &

exec nginx -g 'daemon off;'
