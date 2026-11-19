# Duas imagens em um arquivo: `collector` (coleta em Python) e `web` (site estático com Caddy).

FROM python:3.14-slim AS collector
RUN useradd --create-home --uid 1000 collector \
    && mkdir /data /export \
    && chown collector:collector /data /export
USER collector
WORKDIR /app
COPY collector/collect.py collector/catalog.json ./
ENV DB_PATH=/data/economia.db EXPORT_DIR=/export PYTHONUNBUFFERED=1
# Os volumes nascem com o dono acima, então a coleta grava sem precisar de root.
VOLUME ["/data", "/export"]
ENTRYPOINT ["python3", "collect.py"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY site /srv
