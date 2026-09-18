# Era Character Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-page-per-character project pages with one page per era, characters grouped by a new `type` field, and an in-page table of contents that jumps to each character's section.

**Architecture:** A new `type` field on the existing `projects` content collection classifies each character within its era. `src/lib/projects.js` gains pure, unit-tested grouping/slugging helpers. `src/pages/work/[era].astro` replaces `src/pages/work/[slug].astro`, rendering one static page per unique era built from those helpers; `ProjectCard.astro`'s link is updated to point at the character's era page instead of its own page.

**Tech Stack:** Astro 7 (static output), Vitest, vanilla CSS — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-era-character-pages-design.md`

## Global Constraints

- `type` is a plain required string (`z.string().min(1)`), no fixed enum — same trust level as `era`/`tags` today.
- No redirects from the old `/work/<character-slug>/` URLs.
- `/work/index.astro`'s existing `<Chapter era>` grouping and era/tag filter buttons must keep working unchanged — only `ProjectCard`'s link target changes.
- No `type` filter is added to `/work/`'s existing filters.
- Character anchor ids reuse the existing content-collection `id` (filename minus extension) — already unique site-wide.

---

### Task 1: Grouping and slugging helpers in `src/lib/projects.js`

**Files:**
- Modify: `src/lib/projects.js`
- Test: `src/lib/projects.test.js`

**Interfaces:**
- Produces: `slugifyEra(era: string): string`, `groupByEra(characters: Array<{data: {era: string}}>): Array<{era: string, characters: Array}>`, `groupByType(characters: Array<{data: {type: string}}>): Array<{type: string, characters: Array}>` — all three consumed by Task 3 (`work/[era].astro`) and `slugifyEra` also by Task 4 (`ProjectCard.astro`).

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/lib/projects.test.js`:

```js
import { slugifyEra, groupByEra, groupByType } from './projects.js';

describe('slugifyEra', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyEra('The Age of Gods')).toBe('the-age-of-gods');
  });

  it('strips punctuation', () => {
    expect(slugifyEra("Gods' Age!")).toBe('gods-age');
  });
});

describe('groupByEra', () => {
  it('groups characters by era, preserving first-appearance order of eras', () => {
    const a = project({ era: 'Common Era' });
    const b = project({ era: 'The Age of Gods' });
    const c = project({ era: 'Common Era' });
    const result = groupByEra([a, b, c]);
    expect(result).toEqual([
      { era: 'Common Era', characters: [a, c] },
      { era: 'The Age of Gods', characters: [b] },
    ]);
  });
});

describe('groupByType', () => {
  it('groups characters by type, preserving first-appearance order of types and character order within a type', () => {
    const xipetotl = project({ type: 'god' });
    const leah = project({ type: 'Faulkner' });
    const anotherGod = project({ type: 'god' });
    const result = groupByType([xipetotl, leah, anotherGod]);
    expect(result).toEqual([
      { type: 'god', characters: [xipetotl, anotherGod] },
      { type: 'Faulkner', characters: [leah] },
    ]);
  });
});
```

Note: `project()` is the existing test helper already defined at the top of this file — it spreads `overrides` into `data`, so `project({ type: 'god' })` and `project({ era: 'Common Era' })` both work without changing the helper.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `slugifyEra`, `groupByEra`, `groupByType` are not exported from `./projects.js`.

- [ ] **Step 3: Implement the three functions**

Append to `src/lib/projects.js`:

```js
export function slugifyEra(era) {
  return era
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function groupByEra(characters) {
  const order = [];
  const map = new Map();
  for (const character of characters) {
    const era = character.data.era;
    if (!map.has(era)) {
      map.set(era, []);
      order.push(era);
    }
    map.get(era).push(character);
  }
  return order.map((era) => ({ era, characters: map.get(era) }));
}

export function groupByType(characters) {
  const order = [];
  const map = new Map();
  for (const character of characters) {
    const type = character.data.type;
    if (!map.has(type)) {
      map.set(type, []);
      order.push(type);
    }
    map.get(type).push(character);
  }
  return order.map((type) => ({ type, characters: map.get(type) }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests, including the 4 new ones, green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.js src/lib/projects.test.js
git commit -m "Add slugifyEra, groupByEra, groupByType helpers"
```

---

### Task 2: Add `type` to the content schema, migrate content, update README

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/content/projects/celestial-drift.md`
- Modify: `src/content/projects/paper-cutout-game.md`
- Modify: `src/content/projects/first-light-render.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: none.
- Produces: every entry in the `projects` collection now has `data.type: string`, which Task 3's `groupByType` (Task 1) and page template rely on.

- [ ] **Step 1: Add the `type` field to the schema**

In `src/content.config.ts`, the schema currently reads:

```ts
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
```

Add `type: z.string().min(1),` right after `era: z.string(),`:

```ts
  schema: z.object({
    title: z.string(),
    era: z.string(),
    type: z.string().min(1),
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
```

- [ ] **Step 2: Migrate the three existing content files**

In `src/content/projects/celestial-drift.md`, the frontmatter currently reads:

```yaml
title: "Xipetotl"
era: "The Age of Gods"
date: 2025-07-12
```

Add `type: "god"` after `era`:

```yaml
title: "Xipetotl"
era: "The Age of Gods"
type: "god"
date: 2025-07-12
```

In `src/content/projects/paper-cutout-game.md`, the frontmatter currently reads:

```yaml
title: "Leah Faulkner"
era: "Common Era"
date: 2024-11-03
```

Add `type: "Faulkner"` after `era`:

```yaml
title: "Leah Faulkner"
era: "Common Era"
type: "Faulkner"
date: 2024-11-03
```

In `src/content/projects/first-light-render.md`, the frontmatter currently reads:

```yaml
title: "First Light"
era: "Nebula Era"
date: 2024-02-20
```

Add `type: "unsorted"` after `era` (this file's write-up is still placeholder content unrelated to this feature — the exact type value doesn't matter, it just needs to satisfy the schema):

```yaml
title: "First Light"
era: "Nebula Era"
type: "unsorted"
date: 2024-02-20
```

- [ ] **Step 3: Update the README's field list**

In `README.md`, under "Adding a new project", this line:

```markdown
2. Fill in the frontmatter (see any existing file in that folder for
   every field and what it means — `title`, `era`, `date`, `tags`,
   `cover`, `gallery`, `tools`, `links`, `featured`, `draft`).
```

becomes:

```markdown
2. Fill in the frontmatter (see any existing file in that folder for
   every field and what it means — `title`, `era`, `type`, `date`,
   `tags`, `cover`, `gallery`, `tools`, `links`, `featured`, `draft`).
```

- [ ] **Step 4: Build to verify the schema validates**

Run: `npm run build`
Expected: build succeeds (exit 0), no Zod validation errors. (This will still be building the *old* `work/[slug].astro` page at this point in the plan — that's expected, Task 3 replaces it.)

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content/projects/celestial-drift.md src/content/projects/paper-cutout-game.md src/content/projects/first-light-render.md README.md
git commit -m "Add required type field to project schema and content"
```

---

### Task 3: Replace `work/[slug].astro` with `work/[era].astro`

**Files:**
- Create: `src/pages/work/[era].astro`
- Delete: `src/pages/work/[slug].astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `visibleProjects` (existing, from `src/lib/projects.js`), `groupByEra`, `groupByType`, `slugifyEra` (Task 1, `src/lib/projects.js`).
- Produces: URLs of the form `/work/<era-slug>/`, each containing anchors `#<character-id>` — consumed by Task 4's updated `ProjectCard` link.

- [ ] **Step 1: Delete the old per-character page**

```bash
git rm "src/pages/work/[slug].astro"
```

- [ ] **Step 2: Create the era page**

Create `src/pages/work/[era].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import PageLayout from '../../layouts/PageLayout.astro';
import Polaroid from '../../components/Polaroid.astro';
import { visibleProjects, groupByEra, groupByType, slugifyEra } from '../../lib/projects.js';

export async function getStaticPaths() {
  const allProjects = await getCollection('projects');
  const characters = visibleProjects(allProjects);
  const eras = groupByEra(characters);
  return eras.map(({ era, characters: eraCharacters }) => ({
    params: { era: slugifyEra(era) },
    props: { era, characters: eraCharacters },
  }));
}

const { era, characters } = Astro.props;
const typeGroups = groupByType(characters);
const rendered = await Promise.all(
  characters.map(async (character) => ({
    id: character.id,
    Content: (await render(character)).Content,
  })),
);
const contentById = new Map(rendered.map((r) => [r.id, r.Content]));
---
<PageLayout title={era}>
  <p><a href="/work/">← Back to scrapbook</a></p>
  <h1>{era}</h1>

  <nav class="toc" aria-label="Table of contents">
    {typeGroups.map(({ type, characters: typeCharacters }) => (
      <div class="toc-group">
        <p class="toc-group-label">{type}</p>
        <ul>
          {typeCharacters.map((character) => (
            <li><a href={`#${character.id}`}>{character.data.title}</a></li>
          ))}
        </ul>
      </div>
    ))}
  </nav>

  {typeGroups.map(({ type, characters: typeCharacters }) => (
    <section class="type-section">
      <h2>{type}</h2>
      {typeCharacters.map((character) => {
        const { title, tags, gallery, tools, links } = character.data;
        const Content = contentById.get(character.id);
        return (
          <article id={character.id} class="character">
            <h3>{title}</h3>
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
          </article>
        );
      })}
    </section>
  ))}
</PageLayout>

<style>
  .toc {
    margin: var(--space-4) 0;
    padding: var(--space-3);
    background: var(--color-paper-dark);
    border: 1px solid var(--color-ink-soft);
  }
  .toc-group {
    margin-bottom: var(--space-2);
  }
  .toc-group-label {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    margin: 0 0 var(--space-1);
  }
  .toc ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .toc a {
    display: inline-block;
    font-family: var(--font-body);
    background: #fff;
    border: 1px solid var(--color-ink-soft);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    text-decoration: none;
  }
  .type-section {
    margin-bottom: var(--space-6);
  }
  .character {
    margin-bottom: var(--space-5);
  }
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

- [ ] **Step 3: Add smooth-scroll CSS, guarded for reduced motion**

In `src/styles/global.css`, this rule currently exists:

```css
img {
  max-width: 100%;
  display: block;
}
```

Add a new rule directly after it:

```css
img {
  max-width: 100%;
  display: block;
}

html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 4: Build and verify the era pages generate**

Run: `npm run build`
Expected: build succeeds; the route list in the build output shows `/work/the-age-of-gods/index.html`, `/work/common-era/index.html`, and `/work/nebula-era/index.html` (no more `/work/celestial-drift/`, `/work/paper-cutout-game/`, `/work/first-light-render/`).

Then verify the TOC and anchors landed correctly:

Run: `grep -o 'id="celestial-drift"\|href="#celestial-drift"' dist/work/the-age-of-gods/index.html`
Expected: both `id="celestial-drift"` and `href="#celestial-drift"` printed — the TOC link and the section it points to both exist on the same page.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/work/[era].astro" "src/pages/work/[slug].astro" src/styles/global.css
git commit -m "Replace per-character pages with grouped era pages and TOC"
```

---

### Task 4: Point `ProjectCard` at the character's era page

**Files:**
- Modify: `src/components/ProjectCard.astro`

**Interfaces:**
- Consumes: `slugifyEra` (Task 1, `src/lib/projects.js`).

- [ ] **Step 1: Update the card's link**

`src/components/ProjectCard.astro` currently reads:

```astro
---
import Polaroid from './Polaroid.astro';

const { project } = Astro.props;
const { title, era, tags, cover } = project.data;
const href = `/work/${project.id}/`;
---
```

Change the import and the `href` line:

```astro
---
import Polaroid from './Polaroid.astro';
import { slugifyEra } from '../lib/projects.js';

const { project } = Astro.props;
const { title, era, tags, cover } = project.data;
const href = `/work/${slugifyEra(era)}/`;
---
```

Nothing else in the file changes.

- [ ] **Step 2: Build and verify the card links**

Run: `npm run build`
Expected: build succeeds.

Run: `grep -o 'class="project-card" href="/work/[a-z-]*/"' dist/work/index.html`
Expected: three matches, each an era-slug URL (`/work/the-age-of-gods/`, `/work/common-era/`, `/work/nebula-era/`) — no character slugs.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectCard.astro
git commit -m "Point project cards at their character's era page"
```

---

### Task 5: Full verification and QA checklist update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests, including the ones added in Task 1.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: build succeeds with no warnings about missing content or broken schema.

- [ ] **Step 3: Add QA checklist bullets for the new TOC**

In `README.md`, under "Manual QA checklist (run before each deploy)", this is the last existing bullet:

```markdown
- [ ] Turn on "reduce motion" in your OS accessibility settings and
      confirm hover/focus effects still work but don't animate.
```

Add two new bullets directly after it:

```markdown
- [ ] Turn on "reduce motion" in your OS accessibility settings and
      confirm hover/focus effects still work but don't animate.
- [ ] On any era page (e.g. `/work/the-age-of-gods/`), click every
      table-of-contents button and confirm it jumps to the matching
      character section further down the same page.
- [ ] On `/work/`, click a project card and confirm it opens that
      character's era page (not a 404, not a different character's
      page).
```

- [ ] **Step 4: Manually verify in the dev server**

Run: `npm run dev`, then in a browser:
1. Open `/work/` — confirm the card grid and era/tag filters still work as before.
2. Click a card — confirm it opens the era page at the top, TOC visible.
3. Click a TOC button — confirm the page jumps to that character's section.
4. Stop the dev server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Add TOC/era-page checks to the manual QA checklist"
```
