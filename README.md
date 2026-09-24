# Portfolio

A vintage-scrapbook-styled portfolio site, built with Astro.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:4321/. Run `npm test` to run the test suite.

## Adding a new project

1. Add a Markdown file to `src/content/projects/`, e.g. `my-new-thing.md`.
2. Fill in the frontmatter (see any existing file in that folder for
   every field and what it means — `title`, `era`, `type`, `date`,
   `tags`, `cover`, `gallery`, `tools`, `links`, `featured`, `draft`).
   `era` decides which page URL the character appears on (a typo
   creates a stray page), and `type` decides which section of that
   page it's grouped under (shown in both the table of contents and
   as a heading).
3. Put its images in `public/images/projects/<slug>/` and point
   `cover`/`gallery` at them with paths starting `/images/...`.
4. Write the body of the file — that becomes the project's full
   write-up.
5. Run `npm run build` to check your frontmatter is valid (it won't
   catch a typo'd image path — open the page in your browser to
   confirm images actually load), then commit and push. Netlify
   redeploys automatically.

Set `draft: true` to keep a project out of the site entirely until
it's ready.

## The Living Portrait page

`/living-portrait` is a webcam-driven 3D avatar demo. All of its code is
in `src/tracker/` (plain TypeScript) and loads lazily — nothing heavy is
downloaded until a visitor clicks "Start camera", and the 3D/tracking
libraries (`three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`) only
load after they grant camera permission. Nothing derived from the camera
ever leaves the browser.

Self-hosted assets live in `public/tracker/` (all committed to the repo,
served from this site's own origin, never a CDN):

- `avatar.vrm` — the 3D model (see "Swapping the avatar" below)
- `avatar.LICENSE.txt` — provenance and license of the shipped model
- `face_landmarker.task` + `wasm/` — the MediaPipe face-reading model and runtime

Type-check the tracker code with:

```bash
npm run check
```

## Swapping the avatar

1. Make or download a **VRM** model (VRoid Studio is free and exports VRM).
2. Keep the file under ~8 MB — in VRoid Studio's export dialog, reduce
   texture size (1024 or 2048) and enable polygon reduction if needed.
3. Replace `public/tracker/avatar.vrm` with your file (keep the name).
4. Update `public/tracker/avatar.LICENSE.txt` to describe your model.
5. Run `npm run build`, then open `/living-portrait/` and check it loads
   and tracks. No code changes are needed — the mapping drives the
   standard VRM expression presets (`blink`, `happy`, `aa`/`ih`/`ou`,
   `surprised`), which every VRM model has.

If a specific expression looks off, every tuning value lives in one
place: `DEFAULT_MAPPING_CONFIG` in `src/tracker/mapping.ts`.

## Manual QA checklist (run before each deploy)

- [ ] Resize the browser (or use dev tools' device toolbar) to phone,
      tablet, and desktop widths — layout doesn't break or scroll
      sideways.
- [ ] Tab through the whole site using only the keyboard — nav links,
      filter buttons, and the contact form are all reachable and show
      a visible focus outline.
- [ ] Submit the contact form on the *deployed* site (not local dev)
      and confirm the email arrives and the page redirects to
      `/contact/thanks/`.
- [ ] Run a Lighthouse audit (Chrome DevTools → Lighthouse tab) on the
      deployed homepage and note the accessibility/performance
      scores.
- [ ] Turn on "reduce motion" in your OS accessibility settings and
      confirm hover/focus effects still work but don't animate.
- [ ] On any era page (e.g. `/work/the-age-of-gods/`), click every
      table-of-contents button and confirm it jumps to the matching
      character section further down the same page.
- [ ] On `/work/`, click a project card and confirm it opens that
      character's era page (not a 404, not a different character's
      page).
- [ ] `/living-portrait/`: on a desktop, click "Start camera", grant
      permission — within a few seconds the avatar mirrors your head,
      blinks, mouth, and smile, smoothly.
- [ ] `/living-portrait/`: deny camera permission — the recovery message
      appears with a "Try again" button that re-prompts.
- [ ] `/living-portrait/`: click "Stop", then check your browser's
      camera indicator has turned off (camera released).
- [ ] `/living-portrait/`: while tracking, switch to another tab and
      back — camera indicator turns off on leave; a "Start again" panel
      is shown on return.
- [ ] `/living-portrait/` on a phone — it either runs (reduced quality)
      or shows a "runs best on a computer" message; it is never blank or
      broken.
- [ ] `/living-portrait/`: cover the camera / leave frame while running —
      the avatar eases to a neutral resting pose rather than freezing or
      glitching.
- [ ] `/living-portrait/`: turn your head left — the avatar's head turns
      to the *same* side of the screen (mirror, like a selfie), not the
      opposite. Same for tilting.

## Known v1 limitations

`PageLayout` currently uses a flat paper background color rather than
the textured/vignette background originally envisioned. The `Sticker`
decorative component exists in `src/components/` but isn't used
anywhere yet (`TapeStrip` is now used on the Living Portrait page).
Both are reasonable candidates for a follow-up pass.

The shipped placeholder avatar ("Rose", a CC0 model) has a minimal
expression rig — it supports mouth shapes, blink, and head movement, but
not `joy` or `surprised`, so **smile and eyebrow-raise do nothing until
you swap in a fuller VRM**. Any VRoid Studio export includes those
presets; see "Swapping the avatar" above. This is a limitation of the
sample model, not the tracker.

## Before your first deploy

The placeholder content below ships by default — replace it before
you point a real domain at this site:

- [ ] `src/pages/index.astro` — replace `Hi, I'm [Your Name] —
      welcome to my scrapbook.` with your actual name/intro.
- [ ] `src/pages/contact.astro` — replace the `mailto:you@example.com`
      link with your real email address.
- [ ] The three sample projects in `src/content/projects/`
      (`celestial-drift.md`, `paper-cutout-game.md`,
      `first-light-render.md`) each have a placeholder body starting
      "Replace this with the real write-up" — write real content,
      remove the sample projects, or set `draft: true` on them.
- [ ] `public/tracker/avatar.vrm` is a CC0 placeholder model ("Rose" by
      Polygonal Mind). Swap in your own VRM before launch if you want a
      personal avatar — see "Swapping the avatar" above. (Leaving the
      placeholder is fine too; its license permits it.)

## Deploying

1. Push this repo to GitHub (create an empty repo on GitHub first,
   then `git remote add origin <url>` and `git push -u origin main`).
2. In Netlify, click "Add new site" → "Import an existing project" →
   choose this GitHub repo.
3. Netlify reads `netlify.toml` automatically (build command
   `npm run build`, publish directory `dist`) — accept the defaults
   it shows you.
4. Click deploy. Your site goes live at a generated
   `<random-name>.netlify.app` address (you can rename this, or
   attach a custom domain later, from the Netlify site settings — no
   code changes needed).
5. The contact form only starts working once the site is deployed
   this way — that's expected.
