FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends knot curl && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /zones
VOLUME ["/zones"]
EXPOSE 53/tcp
EXPOSE 53/udp
ENTRYPOINT ["/entrypoint.sh"]
