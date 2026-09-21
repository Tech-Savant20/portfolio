#!/usr/bin/env bash
# Pushes homelab status from Uptime Kuma to abhyudaytomar.com every run.
# Runs on Jarvis from cron every 2 minutes. Needs curl and jq.
#
# Config lives in /etc/portfolio-status.env (chmod 600):
#   STATUS_TOKEN=...                  same value as the Worker secret
#   KUMA_URL=http://127.0.0.1:3001    optional
#   KUMA_SLUG=portfolio               optional, the status page slug
#   PUSH_URL=https://abhyudaytomar.com/api/status   optional
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/portfolio-status.env}"
# shellcheck source=/dev/null
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

: "${STATUS_TOKEN:?STATUS_TOKEN is not set}"
KUMA_URL="${KUMA_URL:-http://127.0.0.1:3001}"
KUMA_SLUG="${KUMA_SLUG:-portfolio}"
PUSH_URL="${PUSH_URL:-https://abhyudaytomar.com/api/status}"

page="$(curl -fsS --max-time 10 "$KUMA_URL/api/status-page/$KUMA_SLUG")"
beats="$(curl -fsS --max-time 10 "$KUMA_URL/api/status-page/heartbeat/$KUMA_SLUG")"

# Each status-page group is one server (named Jarvis, vault-server, oracle-1).
# A monitor is up when its latest heartbeat has status 1; maintenance (3)
# counts as up. Monitors with no heartbeats yet are left out. The media tools
# are folded into one "Media automation" entry so their names never leave the
# server.
payload="$(jq -n --argjson page "$page" --argjson beats "$beats" '
  def media: test("radarr|sonarr|prowlarr|qbittorrent|jellyseerr|flaresolverr"; "i");
  [ $page.publicGroupList[] as $g
    | $g.monitorList[]
    | ($beats.heartbeatList[(.id | tostring)] // []) as $hb
    | select($hb | length > 0)
    | { server: ($g.name | ascii_downcase | gsub("[^a-z0-9-]"; "-")),
        name: .name,
        up: (($hb | last | .status) as $s | $s == 1 or $s == 3) } ]
  | (map(select(.name | media | not)))
    + (map(select(.name | media)) | if length == 0 then [] else
        group_by(.server) | map({ server: .[0].server, name: "Media automation", up: all(.up) }) end)
  | { services: . }
')"

curl -fsS --max-time 15 -X POST "$PUSH_URL" \
  -H "authorization: Bearer $STATUS_TOKEN" \
  -H "content-type: application/json" \
  --data-binary "$payload" >/dev/null
