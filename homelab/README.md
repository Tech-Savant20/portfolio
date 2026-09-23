# Live homelab status

The homelab section of the site and https://abhyudaytomar.com/status show live
status from Uptime Kuma. Nothing in the homelab is exposed to the internet:
Jarvis and vault-server each run Uptime Kuma, and each pushes a small JSON
summary of its results to the site's Worker every 2 minutes over ordinary
outbound HTTPS. The Worker never connects to the homelab, so Tailscale stays
closed to the outside.

```
Jarvis:        Uptime Kuma (services)   -> push-status.sh (cron, SOURCE=jarvis)       ┐
vault-server:  Uptime Kuma (host checks)-> push-status.sh (cron, SOURCE=vault-server) ┤
                                                                                      ↓
                        POST https://abhyudaytomar.com/api/status   (bearer token)
                        -> D1: latest report per server + daily uptime per check
                        -> GET /api/status  (merged)  -> the map on the site
                        -> GET /api/uptime  (30 days) -> /status
```

The site merges the latest report from each server. A report older than 10
minutes is dropped while the other server's report is fresh: so if Jarvis dies,
its last "all up" doesn't linger, and vault-server's check on Jarvis shows it as
offline.

## What gets reported

- **Service checks.** Each group on the Kuma status page is one server, named
  `Jarvis`, `vault-server` or `oracle-1`, and a monitor's name is the service's
  name on the site (Nextcloud, Pi-hole, Vaultwarden, ...). Media tools (Radarr,
  Sonarr, Prowlarr, qBittorrent, Jellyseerr, FlareSolverr) are merged into one
  "Media automation" entry before anything leaves the server.
- **Host checks.** A monitor whose name starts with a server's name, such as
  `Jarvis`, `Vault-server (host)` or `Oracle-1 (Minecraft)`, is reported as that
  server's reachability ("Host"), whatever group it is in. The map shows these
  as online/offline on each server.
- Monitors with names the site doesn't know still count on /status; on the map
  they simply don't light anything.

## Setup

Do steps 1, 3 and 4 on **both** Jarvis and vault-server.

1. **Status page in Uptime Kuma.** Create a status page with the slug
   `portfolio` and publish it. Add the monitors you want on the site, grouped
   as described above.

2. **Token** (once, on your PC in this repo). The same token is used by both
   servers:

   ```powershell
   $tok = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
   $tok | Set-Content -NoNewline homelab/.status-token
   $tok | npx wrangler secret put STATUS_TOKEN
   ```

3. **Script and config file** (`curl` and `jq` needed: `sudo apt install -y curl jq`):

   ```sh
   sudo curl -fsSL https://raw.githubusercontent.com/Tech-Savant20/portfolio/main/homelab/push-status.sh \
     -o /usr/local/bin/portfolio-push-status
   sudo chmod 755 /usr/local/bin/portfolio-push-status
   sudo install -m 600 /dev/null /etc/portfolio-status.env
   sudo nano /etc/portfolio-status.env
   ```

   ```
   STATUS_TOKEN=<the token>
   SOURCE=jarvis            # vault-server on vault-server
   KUMA_SLUG=portfolio
   # KUMA_URL=http://127.0.0.1:3001   only if Kuma isn't on port 3001 of this machine
   ```

4. **Test, then cron:**

   ```sh
   sudo portfolio-push-status && echo ok
   sudo crontab -e
   ```

   ```
   */2 * * * * /usr/local/bin/portfolio-push-status >/dev/null 2>&1
   ```

   A 401 means the token doesn't match the Worker secret; a 422 means the status
   page has no monitors with heartbeats yet.

5. **Check it.** `curl -s https://abhyudaytomar.com/api/status` should return
   `"available": true`, the merged checks, and both servers under `sources`.
   The answer is cached for 30 seconds.

## Free-plan budget

Two servers every 2 minutes is 1,440 pushes a day. Each push writes one row of
latest status and one row per check to D1 (about 30 rows), roughly 45,000 rows
a day against the free plan's 100,000.
