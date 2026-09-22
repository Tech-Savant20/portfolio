# abhyudaytomar.com

My portfolio. One site with three views (backend, cloud and AI/ML) that reorder
the same work for whoever is reading, four case studies, and a live 3D map of my
homelab.

**Stack:** Astro 7, Tailwind CSS 4, GSAP, Three.js, TypeScript. Hosted on
Cloudflare Workers (static assets plus a small Worker for the API), with
Workers KV, Turnstile and Email Service.

## Layout

```
src/
  data/          all site content: roles, projects, case studies, homelab, skills
  components/    Astro components (hero, project stack, homelab, charts, diagrams)
  scripts/       client code: role switching, scroll effects, 3D scene, contact form
  pages/         /, /cloud, /ai, /work/[slug], 404
worker/          API: /api/status (homelab) and /api/contact
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
5. `npm run deploy`. The KV namespace and the custom domains are set up on the
   first deploy.

## Notes

- The site honours `prefers-reduced-motion`: no intro or scroll effects, and the
  3D map renders as a still scene. `prefers-color-scheme` picks the theme until
  the visitor chooses one.
- Case-study numbers are checked against the project repos. Team results
  (DocPilot) are labelled as team results.
