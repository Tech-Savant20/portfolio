#!/usr/bin/env bash
# Pushes homelab status from this server's Uptime Kuma to abhyudaytomar.com.
# Runs from cron every 2 minutes on Jarvis and on vault-server. Needs curl and jq.
#
# Config lives in /etc/portfolio-status.env (chmod 600):
#   STATUS_TOKEN=...                  same value as the Worker secret
#   SOURCE=jarvis                     which server this is: jarvis or vault-server
#   KUMA_URL=http://127.0.0.1:3001    optional
#   KUMA_SLUG=portfolio               optional, the status page slug
#   SERVERS="jarvis vault-server oracle-1"   optional, the servers on the site
#   PUSH_URL=https://abhyudaytomar.com/api/status   optional
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/portfolio-status.env}"
# shellcheck source=/dev/null
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

: "${STATUS_TOKEN:?STATUS_TOKEN is not set}"
: "${SOURCE:?SOURCE is not set (jarvis or vault-server)}"
KUMA_URL="${KUMA_URL:-http://127.0.0.1:3001}"
KUMA_SLUG="${KUMA_SLUG:-portfolio}"
SERVERS="${SERVERS:-jarvis vault-server oracle-1}"
PUSH_URL="${PUSH_URL:-https://abhyudaytomar.com/api/status}"

page="$(curl -fsS --max-time 10 "$KUMA_URL/api/status-page/$KUMA_SLUG")"
beats="$(curl -fsS --max-time 10 "$KUMA_URL/api/status-page/heartbeat/$KUMA_SLUG")"

# Service checks: each status-page group is one server (Jarvis, vault-server,
# oracle-1), and the monitor's name is the service's name on the site.
#
# Host checks: a monitor whose name starts with a server's name, like "Jarvis",
# "Vault-server (host)" or "Oracle-1 (Minecraft)", is reported as that server's
# "Host" check, whatever group it's in.
#
# A monitor is up when its latest heartbeat has status 1; maintenance (3)
# counts as up. Monitors with no heartbeats yet are left out. The media tools
# are folded into one "Media automation" entry so their names never leave the
# server.
payload="$(jq -n --argjson page "$page" --argjson beats "$beats" \
  --arg source "$SOURCE" --arg servers "$SERVERS" '
  def slug: ascii_downcase | gsub("[^a-z0-9]+"; "-") | gsub("^-|-$"; "");
  def media: test("radarr|sonarr|prowlarr|qbittorrent|jellyseerr|flaresolverr"; "i");
  ($servers | split(" ") | map(select(length > 0))) as $known
  | [ $page.publicGroupList[] as $g
      | $g.monitorList[]
      | ($beats.heartbeatList[(.id | tostring)] // []) as $hb
      | select($hb | length > 0)
      | (.name | slug) as $n
      | ([ $known[] as $s | select($n == $s or ($n | startswith($s + "-"))) | $s ] | first) as $host
      | { server: ($host // ($g.name | slug)),
          name: (if $host then "Host" else .name end),
          up: (($hb | last | .status) as $s | $s == 1 or $s == 3) } ]
  | (map(select(.name | media | not)))
    + (map(select(.name | media)) | if length == 0 then [] else
        group_by(.server) | map({ server: .[0].server, name: "Media automation", up: all(.up) }) end)
  | { source: $source, services: . }
')"

curl -fsS --max-time 15 -X POST "$PUSH_URL" \
  -H "authorization: Bearer $STATUS_TOKEN" \
  -H "content-type: application/json" \
  --data-binary "$payload" >/dev/null
