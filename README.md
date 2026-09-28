# abhyudaytomar.com

My portfolio. One site with three views (backend, cloud and AI/ML) that reorder
the same work for whoever is reading, four case studies, a live 3D map of my
homelab, and a few things to find if you poke around.

**[Live site](https://abhyudaytomar.com)** · [Status](https://abhyudaytomar.com/status) ·
[llms.txt](https://abhyudaytomar.com/llms.txt)

https://github.com/user-attachments/assets/3480e171-b327-4d7f-8b9d-c4c4f3ce1922

<sub>A 40-second tour of the site. If the player doesn't load, [download the MP4](docs/tour.mp4).</sub>

## What's on it

- **Three views of one site.** `/`, `/cloud` and `/ai` reorder the projects,
  skills and hero line for backend, cloud or ML readers, without a page load.
- **Case studies** for LastMile IQ, the Jarvis homelab, DocPilot and a diabetic
  retinopathy model: architecture, decisions and results, with numbers checked
  against each project's repo.
- **My journey:** a three.js Earth turns to India, then an orb travels the map
  from city to city.
- **A live homelab.** Three servers on one Tailscale mesh push their Uptime Kuma
  results to the site; `/status` shows 30 days of uptime from Cloudflare D1.
- **Certifications as a deck of cards**, shuffled by a dealer's hands.
- **Easter eggs:** a terminal (press <kbd>`</kbd>), X-ray mode, the Konami code,
  game mode, and a blackjack table the server deals for aura points.

## Stack

Astro 7, Tailwind CSS 4, GSAP, Three.js and TypeScript. Hosted on Cloudflare
Workers (static assets plus a small Worker for the API), with D1, Turnstile and
Email Service. Contact messages are archived in Supabase.

## Running it locally

Needs Node 22.12 or newer.

```sh
npm install
npm run dev       # site only, at http://localhost:4321
npm run preview   # build and run the real Worker, API included, at http://127.0.0.1:8787
```

Local secrets live in `.dev.vars` (git-ignored). It uses Cloudflare's Turnstile
test keys, so the contact form works locally and `wrangler dev` only simulates
sending email.

## Layout

```
src/
  data/          all site content: roles, projects, case studies, homelab, skills
  components/    Astro components (hero, project stack, homelab, charts, diagrams)
  scripts/       client code: role switching, scroll effects, 3D scene, contact form
  lib/           shared logic (blackjack rules, the LastMile rate engine)
  pages/         /, /cloud, /ai, /work/[slug], /status, /casino, 404, llms.txt
worker/          API: /api/status, /api/uptime, /api/contact, /api/casino, /api/visits
worker/migrations/  D1 schema
homelab/         cron script that pushes live status from Uptime Kuma (Jarvis and vault-server)
scripts/         build and maintenance scripts (see below)
video/           the tour video above, as a HyperFrames composition
docs/            the rendered tour video
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
| `npm test` | Blackjack rules tests |
| `npm run photo` | Rebuild the tritone portrait from `photo-src/portrait-cutout.png` |
| `npm run hero` | Rebuild the hero cut-out and its backdrop colours from `photo-src/` |
| `node scripts/make-earth.mjs` | Rebuild the journey globe's NASA imagery (downloads ~170 MB once, to a cache outside the project) |
| `node scripts/make-geo.mjs` | Rebuild the journey's India map and boundary data |
| `node scripts/make-images.mjs` | Re-render the Open Graph cards (the role cards from the hero photo) and touch icon |
| `node scripts/smoke-api.mjs <url> <token>` | Smoke-test the API and pages |
| `node scripts/qa-screens.mjs <url> <dir>` | Screenshots in light, dark, motion and phone modes |

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
6. D1, for homelab status and its history: `npx wrangler d1 create abhyudaytomar-uptime`,
   put its id in `wrangler.jsonc`, then
   `npx wrangler d1 migrations apply abhyudaytomar-uptime --remote`
   (and `--local` for `npm run preview`).
7. `npm run deploy`. The custom domains are set up on the first deploy.

---

## How it works

### Live status and the status page

Jarvis and vault-server each run Uptime Kuma and push their results to
`POST /api/status` every two minutes (`homelab/README.md` has the setup). The
Worker keeps the latest report from each in D1 (`latest_status`) and
`GET /api/status` merges them, dropping a report that has gone stale while the
other is fresh, so a dead Jarvis shows as offline (vault-server checks it)
rather than as its last "all up". Every push also adds one check per service to
that day's row in `uptime_daily` (days in India time), plus a row counting that
server's pushes, so a server that stops reporting shows as missing reports
rather than downtime.

`/status` shows the live status and 30 days of uptime per check.
`GET /api/uptime` returns the 30 days and is cached at the edge for five
minutes; `/api/status` for 30 seconds. About 45,000 D1 rows are written a day,
inside the free plan's 100,000; rows older than 400 days are dropped.

### The opening

- **Preloader** (`Preloader.astro`, `src/scripts/preloader.ts`): "hello" in a run of
  languages (नमस्ते, Hello, வணக்கம், ਸਤ ਸ੍ਰੀ ਅਕਾਲ, নমস্কার, કેમ છો, Hola, こんにちは), then
  the screen lifts off with a curved edge. Once per browser session, home pages
  only; an inline script decides before first paint, so there's no flash, and
  it never shows without JS or with reduced motion.
- **Hero** (`Hero.astro`, `src/scripts/hero.ts`): a cut-out of the studio photo
  in front of a painted wall and disc, which follow the theme (the photo's own
  grey in light, a dark studio in dark), the name as a giant marquee that
  reverses with the scroll direction and speeds up with scroll velocity, a
  "Located in" pill, and the role line. From `photo-src/` (git-ignored):
  `npm run hero` writes `src/assets/hero-cutout.webp` from `hero-cutout.png`
  (made once with @imgly/background-removal-node, not a dependency),
  `src/assets/hero.jpg` (the full photo, for the Open Graph cards) and the
  wall colours in `src/data/hero.json`.
- **Vibe** (`src/scripts/vibe.ts`): "Playing music? Let the circle vibe" makes
  the disc behind the photo swell and glow with the bass and send out a ring on
  each beat. A page can't hear other tabs or apps, so it listens through the
  microphone, only after the button is pressed; the sound is analysed in the
  browser and never recorded or sent. `Permissions-Policy` allows the
  microphone for the site itself only.
- **Menu** (`MenuPanel.astro`, `src/scripts/menu.ts`): over the hero the bar
  takes the hero's ink; past it, the bar slides away and a round menu button
  opens a dark panel with a curved edge (sections, role views, theme, game
  mode, socials), with a round theme switch beside it. Esc closes it, focus
  stays inside while it's open.

### My journey

`Journey.astro`, `src/scripts/journey.ts`, `src/scripts/journey-globe.ts`,
data in `src/data/journey.ts`. On wide screens it pins and scrolls sideways: a
three.js Earth turns to India and zooms in, a dot map of the subcontinent
follows with an orb travelling city to city, then the milestones on a wave the
orb rides. Phones and reduced motion get it stacked.

The Earth is NASA's Blue Marble Next Generation (public domain):
`node scripts/make-earth.mjs` writes a 2048 px world and a sharper patch over
the subcontinent (`public/journey/earth-*.webp`, about 530 KB, loaded only
when the section is near on desktop). `node scripts/make-geo.mjs` writes
`public/journey/geo.json`: land dots from Natural Earth (public domain), and
India drawn to its official boundary as shown by the Survey of India (all of
Jammu & Kashmir and Ladakh, and Arunachal Pradesh), with its 36 states and
union territories.

The section is on while `journeyReady` is true in `src/data/journey.ts`, which
holds the places (Pune, then Bareilly, Tezpur, Jodhpur and Chennai, and Pune
again; cities only, no years) and the milestones. With it off, a local build still shows it
with `PUBLIC_JOURNEY_PREVIEW=1`.

### Game mode and the casino

The joystick in the nav (or `play` in the terminal) turns on game mode
(`src/scripts/game-mode.ts`): a "Player 1, press start" splash with a coin
sound, a violet arcade reskin with faint scanlines, and a HUD at the bottom
with your aura this week, the six secrets as quests (click for a hint to the
next one) and the way into `/casino`, blackjack for aura points. On the home
page the sunglasses light up with rupee signs.

Everyone starts each weekly season (Monday, India time) on 1,000 aura; the top
ten are on the board and last week's leader is crowned. Your bet sits on the
felt as a stack of chips: they fly in from the chip buttons, the dealer pays
winnings out beside them or sweeps them away, and the same bet goes back down
for the next hand.

The Worker deals and scores every hand (`worker/casino.ts`, rules in
`src/lib/blackjack.ts`, tests with `npm test`): per-player shoes shuffled with
crypto randomness, the dealer's hole card kept on the server until the hand
ends, session cookies (HttpOnly, SameSite=Strict, only a hash stored),
Turnstile on joining, same-origin checks and a rate limit on every write.
Tables are in `worker/migrations/0003_casino.sql`. Aura is just for fun:
nothing to buy, nothing to win. Hitting a blackjack is the sixth secret.

### Certifications deck

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
when the deck comes near the screen. The reference images stay out of the repo,
in the git-ignored `photo-src/aliens/`. The power-up sound is synthesised in the
browser.

### Easter eggs

- A terminal opens with the backtick key, or a long press on the logo on phones
  (`src/scripts/terminal.ts`). `help` lists the commands; `ping jarvis` asks the
  real `/api/status`; `visits` shows the visit count on a split-flap board.
  Visits are counted once per browser session by `POST /api/visits`
  (`worker/visits.ts`, `worker/migrations/0004_visits.sql`): only a daily
  total is stored, posts must come from the site itself and are rate limited.
- `xray` in the terminal outlines each component and shows the page's real
  weight from resource timing (`src/scripts/xray.ts`).
- The Konami code (or `herotime` in the terminal, for phones) starts hype mode
  (`src/scripts/hype.ts`, loaded only then): a big Omnitrix dial spins through
  the aliens and slams down with a flash and a shockwave, then for 20 seconds
  the site is in alien mode (green tint, scanlines, glowing and glitching
  headings, the alien's hologram in the corner, pointer sparks, a countdown).
  The last three seconds go red and beep, like the watch timing out in the
  show. Esc or "Power down" ends it early; reduced motion keeps only the
  colours and the countdown. Sounds are synthesised and follow the deck's
  sound switch.
- The footer counts the six secrets found, with a segment lighting up for each
  (`src/scripts/secrets.ts`, kept in `localStorage`): the terminal, X-ray,
  Konami, the Omnitrix, three hand shuffles in a row, and a blackjack in the
  casino.
- Case-study diagrams send a sample request along their edges, and the LastMile
  IQ case study has a working copy of its rate engine
  (`src/lib/rate-engine.ts`, checked against the project's own tests).

### Trail and llms.txt

On desktop, a dotted trail (`ScrollPath.astro`, `src/scripts/scroll-path.ts`)
runs down the home page's side margin and swings to the other margin in the
empty band between sections, so it never crosses a card; it's built from the
page's own layout. It fills in with the accent as you scroll and an orb
rides its tip, a little below the middle of the screen.

`/llms.txt` (`src/pages/llms.txt.ts`) is a plain-text summary of the site for
AI tools, generated at build time from `src/data/`, so it never drifts from
the pages.

### Contact messages in Supabase

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

### The tour video

`video/index.html` is a [HyperFrames](https://hyperframes.heygen.com)
composition (HTML and GSAP, rendered to MP4) built from screenshots of the live
site. To remake it after the site changes:

```sh
node video/capture.mjs     # screenshots of abhyudaytomar.com, plus the fonts, into video/assets/
cd video
npm run check              # lint, layout and contrast checks
npm run render             # writes video/renders/tour.mp4 (needs FFmpeg)
```

Then shrink it into `docs/`:

```sh
ffmpeg -i renders/tour.mp4 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart -an ../docs/tour.mp4
```

The player at the top of this README is a copy uploaded to GitHub, because
GitHub only plays videos inline from its own `user-attachments` links. After a
new render, drag `docs/tour.mp4` into any issue or comment box on GitHub, then
put the link it gives you in place of the old one (you don't need to post the
comment).

## Notes

- The site honours `prefers-reduced-motion`: no intro or scroll effects, and the
  3D map renders as a still scene. `prefers-color-scheme` picks the theme until
  the visitor chooses one.
- Case-study numbers are checked against the project repos. Team results
  (DocPilot) are labelled as team results.

## Credits

- Earth imagery: NASA's Blue Marble Next Generation (public domain).
- Land dots: Natural Earth (public domain). India's outline is DataMeet's
  [india-composite](https://github.com/datameet/maps/tree/master/Country) (CC0);
  the states are DataMeet's
  [States/Admin2](https://github.com/datameet/maps/tree/master/States)
  (CC BY 4.0, credited under the map).
- Shuffle sounds in `public/sounds/` are cut from Kenney's
  [Casino Audio](https://kenney.nl/assets/casino-audio) pack (CC0).
- The Omnitrix and the aliens are Ben 10 fan art (Cartoon Network).
