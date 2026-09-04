# Portfolio Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy v1 of the vintage-scrapbook portfolio website: home, filterable project gallery, individual project pages, and a working contact form.

**Architecture:** An Astro static site (no server, no database). Content lives as Markdown files validated by an Astro content-collection schema. A small module of pure, unit-tested functions (`src/lib/projects.js`) handles sorting, draft-filtering, and era/tag matching, and is reused both at build time (page rendering) and in a small client-side script (gallery filtering). Netlify builds and hosts the site and handles the contact form natively — no backend code anywhere.

**Tech Stack:** Astro (static output), plain CSS, `@fontsource` self-hosted fonts, Vitest for unit tests, Netlify (hosting + Forms).

**Spec:** [docs/superpowers/specs/2026-09-04-portfolio-site-design.md](../specs/2026-09-04-portfolio-site-design.md)

## Global Constraints

- No CSS framework/UI kit (plain CSS only) — spec Section "Tech stack".
- Fonts are self-hosted via `@fontsource` packages, never loaded from Google Fonts or another external host — spec "Tech stack" / "Design system".
- No TypeScript anywhere except the one required Astro content-config file (`src/content.config.ts`) — matches the "mostly new to web" audience from brainstorming.
- Automated tests are: (a) `astro build` must succeed, (b) Vitest unit tests for pure logic only. No end-to-end/browser test framework is introduced — spec "Testing".
- Body text must sit on near-solid paper background, never directly on busy texture (WCAG AA contrast) — spec "Design system".
- `prefers-reduced-motion` must be respected globally — spec "Design system".
- No text is ever baked into an image — spec "Design system".
- A project with `draft: true` must be excluded from the homepage, the `/work` gallery, and must not get a generated `/work/<slug>` page at all — spec "Content model".
- Contact form uses Netlify Forms with a honeypot field; no other backend/service is introduced in v1 — spec "Contact form".
- **Deviation from the spec's literal frontmatter example, decided during planning:** `cover` and `gallery` are plain root-relative path strings served from `public/images/...` (e.g. `/images/projects/<slug>/cover.svg`), not Astro's `image()` asset-pipeline type. This keeps "add an image" a one-step, framework-free action (drop a file in `public/images/`, write its path) appropriate for a beginner, while preserving the same content fields the spec defines. If you want Astro's automatic image optimization later, that's a follow-up, not part of v1.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `src/pages/index.astro`
- Create: `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `test` that every later task relies on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "portfolio",
  "type": "module",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install Astro**

Run (from `~/Documents/Portfolio`): `npm install astro@latest`

Expected: command exits 0; `astro` appears under `dependencies` in `package.json`; `node_modules/` and `package-lock.json` are created.

- [ ] **Step 3: Install Vitest**

Run: `npm install -D vitest@latest`

Expected: `vitest` appears under `devDependencies`.

- [ ] **Step 4: Write `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({});
```

- [ ] **Step 5: Write a placeholder homepage**

`src/pages/index.astro`:

```astro
---
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Portfolio</title>
  </head>
  <body>
    <h1>Portfolio — under construction</h1>
  </body>
</html>
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
.astro/
.env
.DS_Store
```

- [ ] **Step 7: Verify the build works**

Run: `npm run build`

Expected: exits 0, prints a build summary, and creates `dist/index.html`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Scaffold Astro project

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Content schema and pure content-logic module

**Files:**
- Create: `src/content.config.ts`
- Create: `src/lib/projects.js`
- Test: `src/lib/projects.test.js`

**Interfaces:**
- Produces: content collection `projects` with schema fields `title, era, date, tags, cover, gallery, tools, links, featured, draft` (used by every page task).
- Produces: `isVisible(project)`, `sortByDateDesc(projects)`, `visibleProjects(projects)`, `matchesFilter(project, { era, tags })` from `src/lib/projects.js` (used by Tasks 7, 8, 9).
  - A `project` here is any object shaped `{ data: { era, date, tags, draft, ... } }` — this matches what `getCollection()` returns, so pages can pass real entries straight in, and tests can pass small mock objects.

- [ ] **Step 1: Define the content schema**

`src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    era: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    cover: z.string(),
    gallery: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    links: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };
```

- [ ] **Step 2: Write the failing tests**

`src/lib/projects.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isVisible, sortByDateDesc, visibleProjects, matchesFilter } from './projects.js';

function project(overrides = {}) {
  return {
    id: 'test',
    data: {
      title: 'Test',
      era: 'Nebula Era',
      date: new Date('2025-01-01'),
      tags: ['Blender'],
      draft: false,
      ...overrides,
    },
  };
}

describe('isVisible', () => {
  it('returns true when draft is false', () => {
    expect(isVisible(project({ draft: false }))).toBe(true);
  });

  it('returns false when draft is true', () => {
    expect(isVisible(project({ draft: true }))).toBe(false);
  });
});

describe('sortByDateDesc', () => {
  it('orders newest first', () => {
    const older = project({ date: new Date('2024-01-01') });
    const newer = project({ date: new Date('2025-06-01') });
    const result = sortByDateDesc([older, newer]);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(older);
  });
});

describe('visibleProjects', () => {
  it('excludes drafts and sorts the rest newest first', () => {
    const draft = project({ draft: true, date: new Date('2025-12-01') });
    const older = project({ draft: false, date: new Date('2024-01-01') });
    const newer = project({ draft: false, date: new Date('2025-06-01') });
    const result = visibleProjects([draft, older, newer]);
    expect(result).toEqual([newer, older]);
  });
});

describe('matchesFilter', () => {
  it('matches any era when era is "all"', () => {
    expect(matchesFilter(project({ era: 'Nebula Era' }), { era: 'all', tags: [] })).toBe(true);
  });

  it('rejects a non-matching era', () => {
    expect(matchesFilter(project({ era: 'Nebula Era' }), { era: 'Paper Era', tags: [] })).toBe(false);
  });

  it('requires every selected tag to be present', () => {
    const p = project({ tags: ['Blender', 'Animation'] });
    expect(matchesFilter(p, { era: 'all', tags: ['Blender', 'Animation'] })).toBe(true);
    expect(matchesFilter(p, { era: 'all', tags: ['Blender', 'Code'] })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/projects.test.js`

Expected: FAIL — `src/lib/projects.js` does not exist yet.

- [ ] **Step 4: Implement the module**

`src/lib/projects.js`:

```js
export function isVisible(project) {
  return project.data.draft !== true;
}

export function sortByDateDesc(projects) {
  return [...projects].sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

export function visibleProjects(projects) {
  return sortByDateDesc(projects.filter(isVisible));
}

export function matchesFilter(project, { era, tags }) {
  const eraMatches = !era || era === 'all' || project.data.era === era;
  const tagList = tags ?? [];
  const tagMatches = tagList.length === 0 || tagList.every((tag) => project.data.tags.includes(tag));
  return eraMatches && tagMatches;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/projects.test.js`

Expected: PASS, 6 tests.

- [ ] **Step 6: Verify the site still builds**

Run: `npm run build`

Expected: exits 0 (no content files reference the schema yet, so the `projects` collection is simply empty — that's fine).

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add project content schema and pure filter/sort logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Sample project content

**Files:**
- Create: `src/content/projects/celestial-drift.md`
- Create: `src/content/projects/paper-cutout-game.md`
- Create: `src/content/projects/first-light-render.md`
- Create: `public/images/projects/celestial-drift/cover.svg`
- Create: `public/images/projects/paper-cutout-game/cover.svg`
- Create: `public/images/projects/first-light-render/cover.svg`

**Interfaces:**
- Consumes: the schema from Task 2.
- Produces: 3 entries in the `projects` collection (used by Tasks 7, 8, 9 to render real pages). These are placeholder/starter entries — replace their text and swap the cover images for real ones whenever you're ready; nothing else in the site needs to change when you do.

- [ ] **Step 1: Add a placeholder cover image for each project**

`public/images/projects/celestial-drift/cover.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#d9c7a3"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="serif" font-size="28" fill="#3a2f28">Celestial Drift</text>
</svg>
```

`public/images/projects/paper-cutout-game/cover.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#c9d9c2"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="serif" font-size="28" fill="#3a2f28">Paper Cutout Game</text>
</svg>
```

`public/images/projects/first-light-render/cover.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#c2cfd9"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="serif" font-size="28" fill="#3a2f28">First Light</text>
</svg>
```

- [ ] **Step 2: Add the project Markdown files**

`src/content/projects/celestial-drift.md`:

```markdown
---
title: "Celestial Drift"
era: "Nebula Era"
date: 2025-07-12
tags: ["Blender", "Animation"]
cover: "/images/projects/celestial-drift/cover.svg"
gallery:
  - "/images/projects/celestial-drift/cover.svg"
tools: ["Blender", "After Effects"]
links: []
featured: true
draft: false
---

Replace this with the real write-up: what the piece is, how it was
made, and what you learned making it.
```

`src/content/projects/paper-cutout-game.md`:

```markdown
---
title: "Paper Cutout Game"
era: "Paper Era"
date: 2024-11-03
tags: ["Code", "Game"]
cover: "/images/projects/paper-cutout-game/cover.svg"
gallery:
  - "/images/projects/paper-cutout-game/cover.svg"
tools: ["JavaScript"]
links: []
featured: true
draft: false
---

Replace this with the real write-up: what the piece is, how it was
made, and what you learned making it.
```

`src/content/projects/first-light-render.md`:

```markdown
---
title: "First Light"
era: "Nebula Era"
date: 2024-02-20
tags: ["Blender"]
cover: "/images/projects/first-light-render/cover.svg"
gallery:
  - "/images/projects/first-light-render/cover.svg"
tools: ["Blender"]
links: []
featured: false
draft: false
---

Replace this with the real write-up: what the piece is, how it was
made, and what you learned making it.
```

- [ ] **Step 3: Verify the build works**

Run: `npm run build`

Expected: exits 0 (this also validates the frontmatter against the Task 2 schema — a typo here would fail the build with a clear error).

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add starter project content (sample, replace before launch)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Design tokens, fonts, and global styles

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`

**Interfaces:**
- Produces: CSS custom properties (`--color-*`, `--font-*`, `--space-*`, `--tilt-*`) that every later component/page task uses.

- [ ] **Step 1: Install self-hosted fonts**

Run: `npm install @fontsource/caveat @fontsource/libre-baskerville`

Expected: both appear under `dependencies`.

- [ ] **Step 2: Write the design tokens**

`src/styles/tokens.css`:

```css
:root {
  /* Paper & ink */
  --color-paper: #f3ead9;
  --color-paper-dark: #e6d9bf;
  --color-ink: #3a2f28;
  --color-ink-soft: #6b5c4d;
  --color-stain: #8a5a34;
  --color-accent-red: #a8362b;
  --color-accent-teal: #2f6f6a;

  /* Type */
  --font-heading: 'Caveat', cursive;
  --font-body: 'Libre Baskerville', serif;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;
  --space-6: 4rem;

  /* Scrapbook tilt angles — pick from these instead of inventing new ones */
  --tilt-a: -3deg;
  --tilt-b: -1deg;
  --tilt-c: 2deg;
  --tilt-d: 4deg;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Write global styles**

`src/styles/global.css`:

```css
@import './tokens.css';
@import '@fontsource/caveat/700.css';
@import '@fontsource/libre-baskerville/400.css';
@import '@fontsource/libre-baskerville/700.css';

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-body);
  line-height: 1.6;
}

h1, h2, h3 {
  font-family: var(--font-heading);
  color: var(--color-stain);
  margin: 0 0 var(--space-3);
}

a {
  color: var(--color-accent-teal);
}

img {
  max-width: 100%;
  display: block;
}
```

- [ ] **Step 4: Verify the build works**

Run: `npm run build`

Expected: exits 0. (Nothing imports `global.css` yet — that happens in Task 5 — so this step is just confirming the CSS itself is valid and the font packages installed correctly.)

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add scrapbook design tokens and global styles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Page shell — layout, nav, footer, decorative components

**Files:**
- Create: `src/components/Nav.astro`
- Create: `src/components/Footer.astro`
- Create: `src/components/Sticker.astro`
- Create: `src/components/TapeStrip.astro`
- Create: `src/layouts/PageLayout.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: tokens from Task 4 (`src/styles/global.css`).
- Produces: `PageLayout` component with required prop `title: string` and a default `<slot />` for page content (used by every page task from here on).
- Produces: `Sticker` (prop `rotate?: string`, default `'var(--tilt-b)'`) and `TapeStrip` (prop `rotate?: string`, default `'var(--tilt-a)'`) — both decorative, `aria-hidden`, available for any page/component that wants scrapbook flourishes.

- [ ] **Step 1: Write the nav**

`src/components/Nav.astro`:

```astro
---
const links = [
  { href: '/', label: 'Home' },
  { href: '/work/', label: 'Work' },
  { href: '/contact/', label: 'Contact' },
];
const current = Astro.url.pathname;
---
<nav class="nav" aria-label="Primary">
  <ul>
    {links.map((link) => (
      <li>
        <a href={link.href} aria-current={current === link.href ? 'page' : undefined}>
          {link.label}
        </a>
      </li>
    ))}
  </ul>
</nav>

<style>
  .nav ul {
    display: flex;
    gap: var(--space-4);
    list-style: none;
    padding: var(--space-3) var(--space-4);
    margin: 0;
    background: var(--color-paper-dark);
    border-bottom: 2px solid var(--color-ink-soft);
  }
  .nav a {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    text-decoration: none;
    color: var(--color-ink);
  }
  .nav a[aria-current="page"] {
    color: var(--color-accent-red);
    text-decoration: underline;
  }
</style>
```

- [ ] **Step 2: Write the footer**

`src/components/Footer.astro`:

```astro
---
const year = new Date().getFullYear();
---
<footer class="footer">
  <p>&copy; {year} — made with Astro.</p>
</footer>

<style>
  .footer {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-ink-soft);
    font-size: 0.875rem;
  }
</style>
```

- [ ] **Step 3: Write the decorative components**

`src/components/Sticker.astro`:

```astro
---
const { rotate = 'var(--tilt-b)' } = Astro.props;
---
<span class="sticker" style={`--rotate: ${rotate}`} aria-hidden="true"><slot /></span>

<style>
  .sticker {
    display: inline-block;
    transform: rotate(var(--rotate));
  }
</style>
```

`src/components/TapeStrip.astro`:

```astro
---
const { rotate = 'var(--tilt-a)' } = Astro.props;
---
<div class="tape" style={`--rotate: ${rotate}`} aria-hidden="true"></div>

<style>
  .tape {
    width: 4.5rem;
    height: 1.5rem;
    background: rgba(255, 255, 240, 0.55);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    transform: rotate(var(--rotate));
    margin: 0 auto;
  }
</style>
```

- [ ] **Step 4: Write the page layout**

`src/layouts/PageLayout.astro`:

```astro
---
import '../styles/global.css';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';

const { title } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · Portfolio</title>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <Nav />
    <main id="main-content" class="page">
      <slot />
    </main>
    <Footer />
  </body>
</html>

<style>
  .page {
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4);
  }
  .skip-link {
    position: absolute;
    left: -9999px;
    top: 0;
    background: var(--color-accent-red);
    color: #fff;
    padding: var(--space-2) var(--space-3);
    z-index: 10;
  }
  .skip-link:focus {
    left: var(--space-2);
    top: var(--space-2);
  }
</style>
```

- [ ] **Step 5: Wire the homepage to the new layout**

Replace the contents of `src/pages/index.astro`:

```astro
---
import PageLayout from '../layouts/PageLayout.astro';
---
<PageLayout title="Home">
  <h1>Portfolio — under construction</h1>
</PageLayout>
```

- [ ] **Step 6: Verify the build works**

Run: `npm run build`

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add page shell: layout, nav, footer, decorative components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Polaroid and ProjectCard components

**Files:**
- Create: `src/components/Polaroid.astro`
- Create: `src/components/ProjectCard.astro`

**Interfaces:**
- Consumes: tokens from Task 4; `PageLayout`/design system from Task 5.
- Produces: `Polaroid` (props: `src: string`, `alt: string`, `caption?: string`, `rotate?: string`, default `'var(--tilt-c)'`).
- Produces: `ProjectCard` (prop: `project` — a `projects` collection entry as defined in Task 2). Renders an `<a class="project-card" data-era={...} data-tags={...}>` — the `data-era`/`data-tags` attributes are read by the gallery filter script in Task 8, so keep those attribute names if you ever touch this file.

- [ ] **Step 1: Write the Polaroid component**

`src/components/Polaroid.astro`:

```astro
---
const { src, alt, caption, rotate = 'var(--tilt-c)' } = Astro.props;
---
<figure class="polaroid" style={`--rotate: ${rotate}`}>
  <img src={src} alt={alt} />
  {caption && <figcaption>{caption}</figcaption>}
</figure>

<style>
  .polaroid {
    background: #fff;
    padding: var(--space-2) var(--space-2) var(--space-4);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
    transform: rotate(var(--rotate));
    margin: 0;
    width: fit-content;
  }
  .polaroid figcaption {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    text-align: center;
    margin-top: var(--space-2);
    color: var(--color-ink);
  }
</style>
```

- [ ] **Step 2: Write the ProjectCard component**

`src/components/ProjectCard.astro`:

```astro
---
import Polaroid from './Polaroid.astro';

const { project } = Astro.props;
const { title, era, tags, cover } = project.data;
const href = `/work/${project.id}/`;
---
<a class="project-card" href={href} data-era={era} data-tags={tags.join(',')}>
  <Polaroid src={cover} alt={title} caption={title} />
  <p class="meta">{era} · {tags.join(', ')}</p>
</a>

<style>
  .project-card {
    display: inline-block;
    text-decoration: none;
    color: inherit;
    margin: var(--space-3);
  }
  .project-card .meta {
    font-size: 0.85rem;
    color: var(--color-ink-soft);
    text-align: center;
  }
</style>
```

- [ ] **Step 3: Verify the build works**

Run: `npm run build`

Expected: exits 0. (Nothing renders `ProjectCard` yet — that's Task 7 — this just confirms both components compile.)

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add Polaroid and ProjectCard components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Homepage

**Files:**
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `PageLayout` (Task 5), `ProjectCard` (Task 6), `visibleProjects` (Task 2), the `projects` collection (Task 2/3).

- [ ] **Step 1: Write the homepage**

Replace `src/pages/index.astro`:

```astro
---
import PageLayout from '../layouts/PageLayout.astro';
import ProjectCard from '../components/ProjectCard.astro';
import { getCollection } from 'astro:content';
import { visibleProjects } from '../lib/projects.js';

const allProjects = await getCollection('projects');
const featured = visibleProjects(allProjects).filter((project) => project.data.featured);
---
<PageLayout title="Home">
  <section class="intro">
    <h1>Hi, I'm [Your Name] — welcome to my scrapbook.</h1>
    <p>
      I make 3D art and build small software projects. This site is a
      collection of both, organized like a scrapbook by era. Have a
      look around, or say hello.
    </p>
  </section>

  <section class="featured">
    <h2>Featured pages</h2>
    <div class="cards">
      {featured.map((project) => <ProjectCard project={project} />)}
    </div>
    <p><a href="/work/">See the full scrapbook →</a></p>
  </section>
</PageLayout>

<style>
  .cards {
    display: flex;
    flex-wrap: wrap;
  }
</style>
```

Note: `[Your Name]` is a placeholder for you to fill in with your real name/bio — everything else on the page is finished, working content.

- [ ] **Step 2: Verify the build works**

Run: `npm run build`

Expected: exits 0. Open `dist/index.html` in a text editor (or run `npm run dev` and visit `http://localhost:4321/` in a browser) and confirm the two featured sample projects (Celestial Drift, Paper Cutout Game) appear as cards.

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Build homepage with bio and featured project cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Work gallery page (`/work`)

**Files:**
- Create: `src/components/Chapter.astro`
- Create: `src/pages/work/index.astro`

**Interfaces:**
- Consumes: `PageLayout` (Task 5), `ProjectCard` (Task 6, including its `data-era`/`data-tags` attributes), `visibleProjects` and `matchesFilter` (Task 2).
- Produces: `Chapter` (prop: `era: string`, default slot for its project cards) — renders `<section class="chapter" data-era-section={era}>`.

- [ ] **Step 1: Write the Chapter component**

`src/components/Chapter.astro`:

```astro
---
const { era } = Astro.props;
---
<section class="chapter" data-era-section={era}>
  <h2>{era}</h2>
  <div class="chapter-divider" aria-hidden="true"></div>
  <div class="chapter-cards">
    <slot />
  </div>
</section>

<style>
  .chapter-divider {
    border-top: 2px dashed var(--color-ink-soft);
    margin: var(--space-2) 0 var(--space-4);
  }
  .chapter {
    margin-bottom: var(--space-6);
  }
  .chapter-cards {
    display: flex;
    flex-wrap: wrap;
  }
</style>
```

- [ ] **Step 2: Write the gallery page**

`src/pages/work/index.astro`:

```astro
---
import PageLayout from '../../layouts/PageLayout.astro';
import Chapter from '../../components/Chapter.astro';
import ProjectCard from '../../components/ProjectCard.astro';
import { getCollection } from 'astro:content';
import { visibleProjects } from '../../lib/projects.js';

const allProjects = await getCollection('projects');
const projects = visibleProjects(allProjects);

const eras = [...new Set(projects.map((project) => project.data.era))];
const tags = [...new Set(projects.flatMap((project) => project.data.tags))].sort();
---
<PageLayout title="Work">
  <h1>The Scrapbook</h1>

  <div class="filters" role="group" aria-label="Filter projects">
    <div class="filter-group">
      <button type="button" class="era-filter is-active" data-era="all">All eras</button>
      {eras.map((era) => (
        <button type="button" class="era-filter" data-era={era}>{era}</button>
      ))}
    </div>
    <div class="filter-group">
      {tags.map((tag) => (
        <button type="button" class="tag-filter" data-tag={tag}>{tag}</button>
      ))}
    </div>
  </div>

  <p class="empty-state" hidden>No pages match those filters yet.</p>

  {eras.map((era) => (
    <Chapter era={era}>
      {projects
        .filter((project) => project.data.era === era)
        .map((project) => <ProjectCard project={project} />)}
    </Chapter>
  ))}
</PageLayout>

<script>
  import { matchesFilter } from '../../lib/projects.js';

  const eraButtons = document.querySelectorAll('.era-filter');
  const tagButtons = document.querySelectorAll('.tag-filter');
  const chapters = document.querySelectorAll('.chapter');
  const emptyState = document.querySelector('.empty-state');

  let activeEra = 'all';
  const activeTags = new Set();

  function applyFilters() {
    let visibleCount = 0;

    chapters.forEach((chapter) => {
      const cards = chapter.querySelectorAll('.project-card');
      let chapterVisibleCount = 0;

      cards.forEach((card) => {
        const project = {
          data: {
            era: card.dataset.era,
            tags: card.dataset.tags ? card.dataset.tags.split(',') : [],
          },
        };
        const matches = matchesFilter(project, {
          era: activeEra,
          tags: [...activeTags],
        });
        card.hidden = !matches;
        if (matches) chapterVisibleCount += 1;
      });

      chapter.hidden = chapterVisibleCount === 0;
      visibleCount += chapterVisibleCount;
    });

    emptyState.hidden = visibleCount > 0;
  }

  eraButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeEra = button.dataset.era;
      eraButtons.forEach((b) => b.classList.toggle('is-active', b === button));
      applyFilters();
    });
  });

  tagButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        button.classList.remove('is-active');
      } else {
        activeTags.add(tag);
        button.classList.add('is-active');
      }
      applyFilters();
    });
  });
</script>

<style>
  .filters {
    margin-bottom: var(--space-4);
  }
  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .filter-group button {
    font-family: var(--font-body);
    background: var(--color-paper-dark);
    border: 1px solid var(--color-ink-soft);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .filter-group button.is-active {
    background: var(--color-accent-teal);
    color: var(--color-paper);
    border-color: var(--color-accent-teal);
  }
</style>
```

If JavaScript fails to load, every card and chapter starts visible (`hidden` is never set), so the filters degrade to a plain always-visible gallery — matching the spec's progressive-enhancement requirement.

- [ ] **Step 3: Verify the build works**

Run: `npm run build`

Expected: exits 0. Run `npm run dev`, visit `http://localhost:4321/work/`, and confirm: two "chapters" appear (Nebula Era, Paper Era), clicking an era button hides the other chapter, clicking a tag chip narrows further, and clicking "All eras" resets.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add filterable work gallery grouped by era

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Individual project page (`/work/<slug>`)

**Files:**
- Create: `src/pages/work/[slug].astro`

**Interfaces:**
- Consumes: `PageLayout` (Task 5), `Polaroid` (Task 6), `visibleProjects` (Task 2).

- [ ] **Step 1: Write the dynamic route**

`src/pages/work/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import PageLayout from '../../layouts/PageLayout.astro';
import Polaroid from '../../components/Polaroid.astro';
import { visibleProjects } from '../../lib/projects.js';

export async function getStaticPaths() {
  const allProjects = await getCollection('projects');
  const projects = visibleProjects(allProjects);
  return projects.map((project) => ({
    params: { slug: project.id },
    props: { project },
  }));
}

const { project } = Astro.props;
const { title, era, tags, gallery, tools, links } = project.data;
const { Content } = await render(project);
---
<PageLayout title={title}>
  <p><a href="/work/">← Back to scrapbook</a></p>
  <h1>{title}</h1>
  <p class="meta">{era} · {tags.join(', ')}</p>

  <div class="gallery-grid">
    {gallery.map((src) => <Polaroid src={src} alt={title} />)}
  </div>

  <div class="writeup">
    <Content />
  </div>

  {tools.length > 0 && (
    <p><strong>Tools:</strong> {tools.join(', ')}</p>
  )}

  {links.length > 0 && (
    <ul class="links">
      {links.map((link) => (
        <li><a href={link.url}>{link.label}</a></li>
      ))}
    </ul>
  )}
</PageLayout>

<style>
  .gallery-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }
  .writeup {
    max-width: 42rem;
  }
</style>
```

Because `getStaticPaths` builds its list from `visibleProjects` (which drops drafts), a project marked `draft: true` gets no page here at all — visiting its URL 404s, satisfying the Global Constraints rule.

- [ ] **Step 2: Verify the build works**

Run: `npm run build`

Expected: exits 0, and `dist/work/celestial-drift/index.html`, `dist/work/paper-cutout-game/index.html`, `dist/work/first-light-render/index.html` all exist.

- [ ] **Step 3: Manual check**

Run `npm run dev`, visit `http://localhost:4321/work/celestial-drift/`, confirm the write-up, gallery image, and "Back to scrapbook" link all render.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add individual project pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Contact page and Netlify form

**Files:**
- Create: `src/pages/contact.astro`
- Create: `src/pages/contact/thanks.astro`

**Interfaces:**
- Consumes: `PageLayout` (Task 5).

- [ ] **Step 1: Write the contact page**

`src/pages/contact.astro`:

```astro
---
import PageLayout from '../layouts/PageLayout.astro';
---
<PageLayout title="Contact">
  <h1>Say hello</h1>
  <p>
    Have a project, a question, or just want to say hi? Use the form
    below, or find me on the links underneath.
  </p>

  <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/contact/thanks/">
    <input type="hidden" name="form-name" value="contact" />
    <p class="honeypot" hidden>
      <label>Don't fill this out: <input name="bot-field" /></label>
    </p>

    <label for="name">Name</label>
    <input id="name" name="name" type="text" required />

    <label for="email">Email</label>
    <input id="email" name="email" type="email" required />

    <label for="message">Message</label>
    <textarea id="message" name="message" rows="6" required></textarea>

    <button type="submit">Send</button>
  </form>

  <section class="socials">
    <h2>Find me elsewhere</h2>
    <ul>
      <li><a href="mailto:you@example.com">Email</a></li>
    </ul>
  </section>
</PageLayout>

<style>
  form {
    display: grid;
    gap: var(--space-2);
    max-width: 32rem;
    margin-bottom: var(--space-5);
  }
  input, textarea {
    font-family: var(--font-body);
    padding: var(--space-2);
    border: 1px solid var(--color-ink-soft);
    background: #fffdf8;
  }
  button {
    justify-self: start;
    font-family: var(--font-heading);
    font-size: 1.1rem;
    background: var(--color-accent-red);
    color: #fff;
    border: none;
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
  }
  .honeypot {
    position: absolute;
    left: -9999px;
  }
</style>
```

Replace `you@example.com` and add real social links once you have them handy — everything else on this page is finished.

- [ ] **Step 2: Write the thank-you page**

`src/pages/contact/thanks.astro`:

```astro
---
import PageLayout from '../../layouts/PageLayout.astro';
---
<PageLayout title="Thank you">
  <h1>Got it!</h1>
  <p>Thanks for writing — I'll get back to you soon.</p>
  <p><a href="/">← Back home</a></p>
</PageLayout>
```

- [ ] **Step 3: Verify the build works**

Run: `npm run build`

Expected: exits 0, and `dist/contact/index.html` + `dist/contact/thanks/index.html` both exist.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add contact page with Netlify form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: this form will not actually send anything while running `npm run dev` locally — Netlify only activates form handling once the site is deployed (Task 12). That's expected, not a bug.

---

### Task 11: README and manual QA checklist

**Files:**
- Create: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Write the README**

`README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add README with setup, content workflow, and QA checklist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Netlify deployment configuration

**Files:**
- Create: `netlify.toml`
- Modify: `README.md`

**Interfaces:**
- None (build/deploy configuration only).

- [ ] **Step 1: Write the Netlify build config**

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- [ ] **Step 2: Add deployment instructions to the README**

Append to `README.md`:

```markdown

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
   this way — that's expected (see Task 10 in the plan/spec history).
```

- [ ] **Step 3: Run full verification**

Run: `npm run build && npm run test`

Expected: both exit 0 — the build succeeds and all Vitest tests (6, from Task 2) pass.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Portfolio
git add -A
git commit -m "Add Netlify deployment config and instructions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Deploy (manual, outside this plan)**

Follow the README's new "Deploying" section: push to GitHub, then
connect the repo in Netlify's dashboard. This step needs your GitHub
and Netlify accounts, so it isn't something that can be scripted here
— once it's done, v1 is live and matches every item in the spec's
"v1 done criteria."
