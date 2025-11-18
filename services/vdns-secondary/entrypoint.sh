#!/usr/bin/env bash
set -euo pipefail

CORE_URL="${VOIKE_CORE_URL:-http://backend:8080}"
ADMIN_TOKEN="${VOIKE_ADMIN_TOKEN:-${ADMIN_TOKEN:-}}"
ZONE_ID="${VDNS_ZONE_ID:-voike-com}"
ZONE_DOMAIN="${VDNS_ZONE_DOMAIN:-voike.supremeuf.com.}"
ZONE_PATH="${VDNS_ZONE_FILE:-/zones/${ZONE_ID}.zone}"
REFRESH_SECONDS="${VDNS_REFRESH_SECONDS:-60}"

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "[vdns-secondary] VOIKE_ADMIN_TOKEN (or ADMIN_TOKEN) is required" >&2
  exit 1
fi

trap "kill 0" EXIT

mkdir -p "$(dirname "${ZONE_PATH}")" /etc/nsd

fetch_zone() {
  local tmp
  tmp=$(mktemp)
  if curl -sf -H "x-voike-admin-token: ${ADMIN_TOKEN}" \
    "${CORE_URL}/vdns/zones/${ZONE_ID}/export" >"${tmp}"; then
    if [[ ! -f "${ZONE_PATH}" ]]; then
      mv "${tmp}" "${ZONE_PATH}"
      echo "[vdns-secondary] zone ${ZONE_ID} initialized from ${CORE_URL}"
      return 0
    fi
    if cmp -s "${tmp}" "${ZONE_PATH}"; then
      rm -f "${tmp}"
      return 1
    fi
    mv "${tmp}" "${ZONE_PATH}"
    echo "[vdns-secondary] zone ${ZONE_ID} updated from ${CORE_URL}"
    return 0
  else
    rm -f "${tmp}"
    echo "[vdns-secondary] failed to fetch zone from ${CORE_URL}" >&2
    return 2
  fi
}

fetch_zone
rc=$?
if [[ $rc -eq 2 ]]; then
  echo "[vdns-secondary] fatal: unable to download initial zone" >&2
  exit 1
fi

cat >/etc/nsd/nsd.conf <<EOF
server:
    ip-address: 0.0.0.0
    ip-address: ::0
    identity: "${VDNS_IDENTITY:-voike-vdns-secondary}"
zone:
    name: "${ZONE_DOMAIN}"
    zonefile: "${ZONE_PATH}"
EOF

watch_zone() {
  while true; do
    sleep "${REFRESH_SECONDS}"
    fetch_zone
    rc=$?
    if [[ $rc -eq 0 ]]; then
      echo "[vdns-secondary] zone changed, reloading nsd"
      kill -HUP "${NSD_PID}" || true
    fi
  done
}

echo "[vdns-secondary] starting nsd for ${ZONE_DOMAIN}"
/usr/sbin/nsd -d -c /etc/nsd/nsd.conf &
NSD_PID=$!
watch_zone &
wait "${NSD_PID}"
