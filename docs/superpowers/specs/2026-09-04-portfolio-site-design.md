# Portfolio Website — Design Spec

Date: 2026-09-04
Status: Approved by user, ready for implementation planning

## Purpose

A public-facing portfolio website showcasing the user's creative and
coding work (Blender/3D renders, code projects), styled as a vintage
scrapbook. It is the first of two sub-projects; this spec covers only
the website. A second sub-project — a browser-based, real-time face
tracker (webcam → 3D VRM avatar, in the style of VTuber software) —
will get its own design spec later and will be added to this site as
a single new page once the site exists.

## Goals / non-goals

- Goal: a fast, easy-to-maintain static site the user can add new
  projects to by writing a Markdown file.
- Goal: a distinctive, cohesive "vintage scrapbook" visual identity
  that stays readable and accessible.
- Goal: a working contact form with no backend to run or maintain.
- Non-goal (this spec): the face-tracking feature itself. Only a
  navigation slot for it is reserved.
- Non-goal: a CMS/admin panel, a blog, a resume download — explicitly
  not wanted for v1.
- Non-goal: automated end-to-end browser tests — not warranted for a
  static portfolio site.

## Tech stack

- **Astro** (static site generator, output mode: static HTML/CSS,
  minimal JS). Chosen over plain HTML/CSS/JS and over Eleventy because
  it has first-class Markdown "content collections" (fits the
  Markdown-file authoring workflow), ships zero JS by default, and
  gives a clean path to add one interactive "island" for the future
  face tracker without restructuring the site.
- Plain CSS (no Tailwind or UI kit) — the scrapbook look is bespoke
  enough that a utility framework wouldn't save time.
- **Netlify** for hosting: connected to a GitHub repo, auto-deploys on
  push to `main`, free tier, built-in form handling (see Contact
  form). No custom domain yet — starts on the free
  `<name>.netlify.app` subdomain.
- **Vitest** for the small amount of logic that has tests (see
  Testing).

## Project structure

```
portfolio/
  src/
    pages/
      index.astro          → homepage (About/bio)
      work/index.astro     → project gallery (filterable)
      work/[slug].astro    → individual project page (from Markdown)
      contact.astro        → contact form
      contact/thanks.astro → post-submit confirmation page
    content/
      projects/            → one Markdown file per project
    layouts/                → shared page shell (paper bg, nav, footer)
    components/             → ProjectCard, Polaroid, TapeStrip/Sticker,
                               Chapter, Nav
    styles/                 → global.css + scrapbook design tokens
    assets/                 → images imported into pages (optimized at
                               build time by Astro)
  public/                   → files served as-is (favicon; later,
                               VRM model files for the tracker)
  astro.config.mjs
```

Future tracker feature becomes a single new page (e.g.
`src/pages/tracker.astro`) with one interactive island; the exact
route name is a decision for that feature's own spec, not this one.
No changes to the structure above are expected when it's added.

## Pages & navigation

Persistent nav across all pages, styled like a tab divider in a
binder.

| Route | Purpose |
|---|---|
| `/` | Home/About. Photo, short bio, a few "featured" project cards (from projects marked `featured: true`). Links to `/work` and `/contact`. |
| `/work` | Project gallery. Grid of project cards, grouped into "chapters" by **era**, with secondary **tag** filter chips (e.g. Blender, Code, 3D). Sorted newest-first within each era. |
| `/work/<slug>` | One project's full write-up: images/gallery, tools used, links (e.g. demo, source, ArtStation), "back to scrapbook" link. |
| `/contact` | Contact form + social links styled as stickers/badges. |
| `/contact/thanks` | Static confirmation page shown after form submit. |

The `/work` era/tag filtering is implemented with a small (~30 line)
plain JavaScript snippet, scoped to that page only. If JavaScript is
disabled or fails to load, all projects remain visible (filtering is
a progressive enhancement, not required for the content to render).

## Content model

Each project is one Markdown file under `src/content/projects/`.
Astro validates this shape at build time via a content schema, so a
malformed entry (e.g. missing title) fails the build with a clear
error rather than shipping broken.

```markdown
---
title: "Celestial Drift"
era: "Nebula Era"          # groups projects into gallery "chapters"
date: 2025-07-12            # controls newest-first ordering
tags: ["Blender", "Animation"]
cover: "./images/celestial-drift/cover.jpg"
gallery:
  - "./images/celestial-drift/01.jpg"
  - "./images/celestial-drift/02.jpg"
tools: ["Blender", "After Effects"]
links:
  - label: "Watch on YouTube"
    url: "https://..."
featured: true               # show on homepage
draft: false                 # true hides it from the live site
---

Long-form write-up in plain Markdown: what it is, how it was made,
what was learned.
```

## Contact form

- Plain HTML `<form>` with Netlify's `data-netlify="true"` attribute —
  Netlify detects and handles it at deploy time, no backend code.
- Fields: name, email, message, plus a hidden honeypot field for
  basic spam filtering.
- Netlify emails the user on submission and stores submissions in the
  Netlify dashboard. Free tier: 100 submissions/month.
- On submit, the visitor is redirected to `/contact/thanks`.
- Does **not** work in local dev (`astro dev`) — this is expected
  Netlify Forms behavior, not a bug; it only activates once deployed.
- If spam becomes a problem, add Netlify's built-in reCAPTCHA
  challenge (not included in v1). If the 100/month free tier is
  outgrown, swap to Formspree without touching page structure.

## Visual design system — "vintage scrapbook"

**Tokens** (`src/styles/`): a small fixed palette (cream paper, faded
ink, tea-stain brown, one or two accent "marker" colors); 2–3 fonts
(one script font for headings, used sparingly; one clean serif/sans
for body text, self-hosted rather than loaded from Google Fonts, for
speed and privacy); a shared spacing scale; a small fixed set of
rotation angles (−3°, −1°, 2°, 4°) so tilted elements read as
intentional rather than random.

**Components:**
- `PageLayout` — paper-texture background, subtle vignette, nav,
  footer.
- `Polaroid` — image with white border, caption slot, slight
  rotation, soft shadow.
- `TapeStrip` / `Sticker` — decorative accents (CSS + small PNGs),
  marked `aria-hidden` since they carry no content.
- `ProjectCard` — polaroid + title + era + tags.
- `Chapter` — era heading with a divider rule, used on `/work`.

**Accessibility / performance guardrails:**
- Body text always sits on near-solid paper, not busy texture, to
  keep contrast at WCAG AA.
- Textures/stickers are decorative CSS/images only; no text is ever
  baked into an image.
- `prefers-reduced-motion` is respected — page-turn/hover animations
  degrade to simple fades.
- Real semantic HTML underneath the styling (headings, lists, links)
  so the site works with screen readers and on mobile.
- Target budget: homepage under ~500 KB total.

**Texture assets:** a handful of CC0 (public-domain/free-use) paper
and tape textures will be sourced for initial development, with their
source noted in the repo, so the user can later swap in their own
scans.

## Testing

- **Build check:** `astro build` must succeed — this alone catches
  content-schema violations, broken internal links/image paths.
- **Unit tests (Vitest)** for the pieces that have actual logic: the
  `/work` era/tag filter, newest-first project sorting, and that
  `draft: true` hides a project from listings.
- **Manual checklist** (documented in the README): responsive check
  at phone/tablet/desktop widths, keyboard-only navigation through
  nav and the contact form, one Lighthouse pass before launch.
- No automated end-to-end/browser tests — not warranted for this
  site's size and risk profile.

## Deployment

1. Repo pushed to GitHub.
2. GitHub repo connected to Netlify (build command `astro build`,
   publish directory `dist/`).
3. Every push to `main` auto-builds and redeploys to
   `<name>.netlify.app`.
4. Contact form activates automatically once deployed (see note
   above — inert in local dev).
5. A custom domain can be attached later via Netlify's domain
   settings with no code changes.

## v1 "done" criteria

- All five routes (`/`, `/work`, `/work/<slug>`, `/contact`,
  `/contact/thanks`) live and styled in the scrapbook aesthetic.
- 2–3 real projects entered as Markdown content.
- Contact form functioning on the deployed site.
- Site deployed and publicly reachable on Netlify.
- The face tracker is explicitly **not** part of v1 — separate spec
  and build later.
