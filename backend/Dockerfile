# Cram backend — single container: nginx (the M1 edge cap, ADR 0009) in front of
# uvicorn. nginx binds Railway's public $PORT; uvicorn stays on loopback (8000),
# so the body cap + per-IP limit are unavoidable for any request that reaches the app.
FROM python:3.13-slim

# nginx = the M1 reverse proxy; gettext-base = envsubst to template $PORT at boot.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app

# Install pinned deps first for layer caching (lockfile is Linux-safe — see meta/deployment.md).
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock

COPY . .

# Railway injects $PORT at runtime; this default only matters for a local `docker run`.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "/app/deploy/entrypoint.sh"]
