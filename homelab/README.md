# Live homelab status

The homelab section of the site shows live status from Uptime Kuma. Nothing on
the homelab is exposed to the internet: Jarvis pushes a small JSON summary to
the site's Worker every 2 minutes, and the Worker keeps the latest one in
Workers KV. If Jarvis stops pushing, the site shows the last report and how old
it is.

```
Uptime Kuma (Jarvis, localhost:3001)
  -> push-status.sh (cron, every 2 min)
  -> POST https://abhyudaytomar.com/api/status   (bearer token)
  -> Workers KV
  -> GET /api/status  -> the map on the site
```

Two minutes keeps the Worker at 720 KV writes a day, inside the free plan's
1,000. Each push is also tallied per service per day in D1, which feeds the
30-day bars on https://abhyudaytomar.com/status.

## Setup on Jarvis

1. **Status page in Uptime Kuma.** Create a status page with the slug
   `portfolio`. Add one group per server, named exactly `Jarvis`,
   `vault-server` and `oracle-1`, and put each monitor in the group of the
   server it checks. Monitor names should match the service names on the site
   (Nextcloud, Pi-hole, Vaultwarden, ...) so the map can light up the right
   blocks. Media tools (Radarr, Sonarr, Prowlarr, qBittorrent, Jellyseerr,
   FlareSolverr) are merged into one "Media automation" entry before anything
   leaves the server.

2. **Token.** Generate a random token and store it as a Worker secret:

   ```sh
   openssl rand -hex 32            # copy the output
   npx wrangler secret put STATUS_TOKEN
   ```

3. **Config file** (readable only by root):

   ```sh
   sudo install -m 600 /dev/null /etc/portfolio-status.env
   sudo nano /etc/portfolio-status.env
   ```

   ```
   STATUS_TOKEN=<the same token>
   KUMA_SLUG=portfolio
   ```

4. **Script and cron.** `jq` and `curl` are needed (`sudo apt install jq curl`).

   ```sh
   sudo install -m 755 push-status.sh /usr/local/bin/portfolio-push-status
   sudo portfolio-push-status && echo ok     # one manual run first
   sudo crontab -e
   ```

   ```
   */2 * * * * /usr/local/bin/portfolio-push-status >/dev/null 2>&1
   ```

5. **Check it.** `curl -s https://abhyudaytomar.com/api/status` should return
   `"available": true` and the list of services.
