# Portfolio

A vintage-scrapbook-styled portfolio site, built with Astro.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:4321/.

## Adding a new project

1. Add a Markdown file to `src/content/projects/`, e.g. `my-new-thing.md`.
2. Fill in the frontmatter (see any existing file in that folder for
   every field and what it means — `title`, `era`, `date`, `tags`,
   `cover`, `gallery`, `tools`, `links`, `featured`, `draft`).
3. Put its images in `public/images/projects/<slug>/` and point
   `cover`/`gallery` at them with paths starting `/images/...`.
4. Write the body of the file — that becomes the project's full
   write-up.
5. Run `npm run build` to make sure it's valid, then commit and push.
   Netlify redeploys automatically.

Set `draft: true` to keep a project out of the site entirely until
it's ready.

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
