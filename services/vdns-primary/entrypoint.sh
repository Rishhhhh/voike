#!/usr/bin/env bash
set -euo pipefail

CORE_URL="${VOIKE_CORE_URL:-http://backend:8080}"
ADMIN_TOKEN="${VOIKE_ADMIN_TOKEN:-${ADMIN_TOKEN:-}}"
ZONE_ID="${VDNS_ZONE_ID:-voike-com}"
ZONE_DOMAIN="${VDNS_ZONE_DOMAIN:-voike.supremeuf.com.}"
ZONE_PATH="${VDNS_ZONE_FILE:-/zones/${ZONE_ID}.zone}"
REFRESH_SECONDS="${VDNS_REFRESH_SECONDS:-60}"

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "[vdns-primary] VOIKE_ADMIN_TOKEN (or ADMIN_TOKEN) is required" >&2
  exit 1
fi

trap "kill 0" EXIT

mkdir -p "$(dirname "${ZONE_PATH}")" /etc/knot /run/knot
chmod 755 /run/knot
if id knot &>/dev/null; then
  chown -R knot:knot /run/knot "$(dirname "${ZONE_PATH}")" || true
fi

ensure_zone_perms() {
  if id knot &>/dev/null; then
    chown knot:knot "${ZONE_PATH}" || true
  fi
  chmod 644 "${ZONE_PATH}"
}

fetch_zone() {
  local tmp
  tmp=$(mktemp)
  if curl -sf -H "x-voike-admin-token: ${ADMIN_TOKEN}" \
    "${CORE_URL}/vdns/zones/${ZONE_ID}/export" >"${tmp}"; then
    if [[ ! -f "${ZONE_PATH}" ]]; then
      mv "${tmp}" "${ZONE_PATH}"
      ensure_zone_perms
      echo "[vdns-primary] zone ${ZONE_ID} initialized from ${CORE_URL}"
      return 0
    fi
    if cmp -s "${tmp}" "${ZONE_PATH}"; then
      rm -f "${tmp}"
      return 1
    fi
    mv "${tmp}" "${ZONE_PATH}"
    ensure_zone_perms
    echo "[vdns-primary] zone ${ZONE_ID} updated from ${CORE_URL}"
    return 0
  else
    rm -f "${tmp}"
    echo "[vdns-primary] failed to fetch zone from ${CORE_URL}" >&2
    return 2
  fi
}

fetch_zone
rc=$?
if [[ $rc -eq 2 ]]; then
  echo "[vdns-primary] fatal: unable to download initial zone" >&2
  exit 1
fi

cat >/etc/knot/knot.conf <<EOF
server:
  identity: "${VDNS_IDENTITY:-voike-vdns-primary}"
  listen: ["0.0.0.0@53", "::@53"]
log:
  - target: stdout
    any: info
database:
  storage: "/var/lib/knot"
zone:
  - domain: "${ZONE_DOMAIN}"
    file: "${ZONE_PATH}"
EOF

watch_zone() {
  while true; do
    sleep "${REFRESH_SECONDS}"
    fetch_zone
    rc=$?
    if [[ $rc -eq 0 ]]; then
      echo "[vdns-primary] zone changed, reloading knotd"
      kill -HUP "${KNOT_PID}" || true
    fi
  done
}

echo "[vdns-primary] starting knotd for ${ZONE_DOMAIN}"
/usr/sbin/knotd -c /etc/knot/knot.conf &
KNOT_PID=$!
watch_zone &
wait "${KNOT_PID}"
ensure_zone_perms() {
  if id knot &>/dev/null; then
    chown knot:knot "${ZONE_PATH}" || true
  fi
  chmod 644 "${ZONE_PATH}"
}
