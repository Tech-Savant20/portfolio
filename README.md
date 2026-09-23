# abhyudaytomar.com

My portfolio. One site with three views (backend, cloud and AI/ML) that reorder
the same work for whoever is reading, four case studies, and a live 3D map of my
homelab.

**Stack:** Astro 7, Tailwind CSS 4, GSAP, Three.js, TypeScript. Hosted on
Cloudflare Workers (static assets plus a small Worker for the API), with
Workers KV, D1, Turnstile and Email Service.

## Layout

```
src/
  data/          all site content: roles, projects, case studies, homelab, skills
  components/    Astro components (hero, project stack, homelab, charts, diagrams)
  scripts/       client code: role switching, scroll effects, 3D scene, contact form
  lib/           shared logic (the LastMile rate engine for its playground)
  pages/         /, /cloud, /ai, /work/[slug], /status, 404
worker/          API: /api/status and /api/uptime (homelab), /api/contact
worker/migrations/  D1 schema for the uptime history
homelab/         cron script that pushes live status from Uptime Kuma
scripts/         build and maintenance scripts (see below)
```

Most edits happen in `src/data/`. Every project, number and sentence on the
site comes from there.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Astro dev server at http://localhost:4321 (no API) |
| `npm run preview` | Build, then run the real Worker locally at http://127.0.0.1:8787 |
| `npm run build` | Static build into `dist/`, then write `dist/_headers` (CSP with script hashes) |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run check` | Type-check the site and the Worker |
| `npm run photo` | Rebuild the tritone portrait from `photo-src/portrait-cutout.png` |
| `node scripts/make-images.mjs` | Re-render the Open Graph cards and touch icon |
| `node scripts/smoke-api.mjs <url> <token>` | Smoke-test the API and pages |
| `node scripts/qa-screens.mjs <url> <dir>` | Screenshots in light, dark, motion and phone modes |

Local secrets live in `.dev.vars` (git-ignored). It uses Cloudflare's Turnstile
test keys, so the contact form works locally and `wrangler dev` only simulates
sending email.

## Deploying

1. `npx wrangler login`
2. Email: `npx wrangler email routing enable abhyudaytomar.com`, then
   `npx wrangler email routing addresses create <your inbox>` and click the
   verification link. Sending only to your own verified address is free on
   every plan; arbitrary recipients would need Workers Paid.
3. Turnstile: create a widget for `abhyudaytomar.com` and `www.abhyudaytomar.com`,
   then `npx wrangler secret put TURNSTILE_SECRET` and put the site key in `src/data/site.ts`.
4. `npx wrangler secret put STATUS_TOKEN` (see `homelab/README.md`)
5. Supabase, for the archive of contact messages (optional, see below):
   `npx wrangler secret put SUPABASE_URL` and
   `npx wrangler secret put SUPABASE_SECRET_KEY`.
6. D1, for the uptime history: `npx wrangler d1 create abhyudaytomar-uptime`,
   put its id in `wrangler.jsonc`, then
   `npx wrangler d1 migrations apply abhyudaytomar-uptime --remote`
   (and `--local` for `npm run preview`).
7. `npm run deploy`. The KV namespace and the custom domains are set up on the
   first deploy.

## Status page

`/status` shows the live homelab status and 30 days of uptime per service. Each
push to `POST /api/status` (every two minutes, from `homelab/`) also adds one
check to that day's row for every service in D1 (`uptime_daily`, days in India
time), plus a `reports` row counting the pushes, so a day when Jarvis was off
shows as missing reports rather than downtime. `GET /api/uptime` returns the 30
days and is cached at the edge for five minutes. At roughly 25 rows per push the
writes stay well inside D1's free daily allowance; rows older than 400 days are
dropped.

## Easter eggs

- A terminal opens with the backtick key, or a long press on the logo on phones
  (`src/scripts/terminal.ts`). `help` lists the commands; `ping jarvis` asks the
  real `/api/status`.
- `xray` in the terminal outlines each component and shows the page's real
  weight from resource timing (`src/scripts/xray.ts`).
- The Konami code turns the site Omnitrix green for 15 seconds.
- The footer counts the five secrets found (`src/scripts/secrets.ts`, kept in
  `localStorage`): the terminal, X-ray, Konami, the Omnitrix, and three hand
  shuffles in a row.
- Case-study diagrams send a sample request along their edges, and the LastMile
  IQ case study has a working copy of its rate engine
  (`src/lib/rate-engine.ts`, checked against the project's own tests).

## Contact messages in Supabase

Every submission that gets past Turnstile is written to a `contact_messages`
table before the email goes out, so nothing is lost if mail delivery fails. The
table is created by `supabase/migrations/20260923000000_contact_messages.sql`.

Row level security is on and the table grants no policies, so the publishable
(anon) key can neither read nor write it. The Worker uses a secret key, which is
a Worker secret and never reaches the browser. Name, email, message, country and
user agent are stored; the IP address is not. Supabase's advisor flags "RLS
enabled, no policy" on this table; that is the intended deny-all setup.

The project is `portfolio` (ref `tuboqyqbnyzewyrifhzp`, Mumbai). `.mcp.json`
points Claude Code at the Supabase MCP server for it, so migrations and queries
can be run from a session (`/mcp` to authenticate).

## Certifications deck

The certifications are a deck of cards (`src/scripts/deck.ts`), handled by a
dealer's hands (`DealerHands.astro`, `src/scripts/hands.ts`). When the section
scrolls in, the hands shuffle with a random effect (a classic riffle with a
bridge, a spin, or an overhand; never the same twice running), sweep the deck
into a face-down ribbon, and a wave runs through it as a hint. Clicking any card
turns the ribbon over like dominoes and the cards slide apart; after that each
card flips on its own. If nobody clicks, the ribbon turns over when the visitor
scrolls on or after 6 seconds. "Shuffle again" plays a shuffle sound; the
automatic one is silent. Reduced motion shows the cards face up with no hands.
Left alone for 20 seconds the dealer does a small flourish, and a hand waves
when the pointer passes over it.

The dealer wears a Galaxy Watch 4 showing the time in Pune (`src/scripts/watch.ts`).
Click it and it becomes the Omnitrix; the dial flickers through the other aliens
before locking in and projecting a hologram of the next one:
XLR8, Four Arms, Diamondhead, Swampfire and Ghostfreak. The holograms are traced
from reference art into three tones and load from `public/holo/aliens.json` only
when the deck comes near the screen. The Omnitrix and the aliens are Ben 10 fan
art (Cartoon Network); the reference images stay out of the repo, in the
git-ignored `photo-src/aliens/`. The power-up sound is synthesised in the browser.

The shuffle sounds in `public/sounds/` are cut from Kenney's
[Casino Audio](https://kenney.nl/assets/casino-audio) pack (CC0).

## Notes

- The site honours `prefers-reduced-motion`: no intro or scroll effects, and the
  3D map renders as a still scene. `prefers-color-scheme` picks the theme until
  the visitor chooses one.
- Case-study numbers are checked against the project repos. Team results
  (DocPilot) are labelled as team results.
