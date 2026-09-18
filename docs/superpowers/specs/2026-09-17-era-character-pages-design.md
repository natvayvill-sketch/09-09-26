# Era character pages — design spec

## Problem

The project detail page is currently one file = one character = one page
(`src/content/projects/<slug>.md` → `/work/<slug>/`). The site's real
subject is characters grouped into eras (e.g. "The Age of Gods" contains
gods like Xipetotl; "Common Era" contains the Faulkner family, including
Leah Faulkner), and characters are further classified by a `type` within
their era (god, Faulkner, ...). Readers currently have no way to browse
an era's full cast from one place, or jump straight to a character they
already know they want.

## Goals

- One page per era, listing every character in that era, grouped by
  `type`.
- Each character keeps its own in-depth section (gallery, write-up,
  tools, links) on that shared page.
- A table-of-contents at the top of each era page, grouped by type, with
  a jump-button per character.
- `/work/` (the card grid) keeps working as a browsable index; clicking a
  character's card opens that character's era page.

## Non-goals

- No change to how `/work/` groups cards into `<Chapter era>` sections,
  or to its era/tag filter buttons — both keep working as they do today.
- No fixed enum of `type` values — it's a plain string, same trust level
  as `era`/`tags` today. Authors aren't blocked from inventing a new type.
- No redirects from the old `/work/<slug>/` URLs. The site has no
  external inbound links yet to preserve.
- No `type` filter added to `/work/`'s existing era/tag filters — not
  requested; can be a follow-up if wanted.

## Content schema

`src/content.config.ts`: the `projects` collection gains one required
field:

```ts
type: z.string().min(1),
```

Everything else — `title` (the character's name), `era`, `date`, `tags`,
`cover`, `gallery`, `tools`, `links`, `featured`, `draft` — is unchanged.
Authoring a character is still "add one markdown file, fill in
frontmatter, write the body" per the README's existing instructions.

The collection and folder keep the name `projects` /
`src/content/projects/`. Renaming to `characters` would touch every
`getCollection('projects')` call site and the folder path for no
functional change — out of scope here.

## Routing: `src/pages/work/[era].astro` replaces `work/[slug].astro`

`getStaticPaths()`:

1. `getCollection('projects')` → `visibleProjects()` (unchanged, from
   `src/lib/projects.js`).
2. Group the result by `era`.
3. Return one static path per unique era: `{ params: { era: slugifyEra(era) }, props: { era, characters } }`.

Page template, in order:

1. `<a href="/work/">← Back to scrapbook</a>`, `<h1>{era}</h1>`.
2. **Table of contents** — `characters` grouped by `type` via
   `groupByType()`. Rendered as a nav: one heading per type, one
   button-styled anchor link per character under it
   (`<a href="#{character.id}">{character.data.title}</a>`).
3. **Sections** — the same type grouping again, this time rendering
   full content: `<section>` per type (`<h2>{type}</h2>`), containing one
   `<article id="{character.id}">` per character with its name (`<h3>`),
   `era · tags` meta line, its `gallery` rendered as the existing
   `Polaroid` grid, the rendered markdown body (`<Content />` from
   `render(character)`), `tools`, and `links` — i.e. the same fields
   `work/[slug].astro` renders today, just repeated per character instead
   of once per page.

The TOC and the sections are both driven by one call to `groupByType()`
per page — there's exactly one grouping, rendered twice, so the TOC can't
drift out of sync with what's actually on the page.

Anchor jumps are plain `href="#slug"` links; no JS. `scroll-behavior:
smooth` is added globally in `global.css` (harmless on pages without
anchors), guarded for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

This is a separate rule from the existing global reduced-motion block in
`tokens.css`, which only clamps `transition-duration`/
`animation-duration` and has no effect on `scroll-behavior`.

## `/work/` index and `ProjectCard`

No structural change: still one `<Chapter era>` section per era on
`/work/index.astro`, still populated with one `<ProjectCard>` per
character, still filterable by era/tag exactly as today.

The only change is `ProjectCard.astro`'s link target: from
`/work/${project.id}/` to `/work/${slugifyEra(project.data.era)}/` — a
character's card now opens the top of its era's page (TOC first), not a
page of its own.

## New code in `src/lib/projects.js`

Two new pure functions, tested the same way `isVisible` /
`sortByDateDesc` / `matchesFilter` are today (`projects.test.js`):

- `slugifyEra(era)` — turns an era string into a URL-safe slug (e.g.
  `"The Age of Gods"` → `"the-age-of-gods"`). Used both by
  `getStaticPaths()` to build era page paths and by `ProjectCard` to
  build its link.
- `groupByType(characters)` — groups an array of character entries by
  `data.type`, preserving first-appearance order (matching the existing
  `[...new Set(projects.map(p => p.data.era))]` dedup-order pattern used
  in `work/index.astro`). Returns an ordered structure (array of
  `{ type, characters }` groups) that both the TOC and the section
  renderer in `work/[era].astro` consume identically.

## Migrating existing content

- `celestial-drift.md` (Xipetotl) → `type: "god"`.
- `paper-cutout-game.md` (Leah Faulkner) → `type: "Faulkner"`.
- `first-light-render.md` (still placeholder write-up, unrelated to this
  feature) → needs some non-empty `type` value to satisfy the schema;
  exact value doesn't matter since the content itself is still a
  placeholder.

## Error handling / edge cases

- `type` is `z.string().min(1)` — an empty or missing `type` fails the
  build with a clear Zod error, same failure mode as a missing `title`
  today.
- An era with a single type/character still renders correctly — the TOC
  just has one group with one button; no special-casing needed.
- Character `id` (from the markdown filename, already unique
  site-wide) is reused as the in-page anchor id — no new uniqueness
  concern, since it was already guaranteed unique as a route param
  before this change.

## Testing

- TDD: write failing tests for `slugifyEra` and `groupByType` in
  `projects.test.js` first, then implement.
- `npm run build`: confirms era pages generate (one per unique era —
  currently 3, same count as before since each existing era happens to
  have exactly one character, though the *meaning* changes from
  "1 page per character" to "1 page per era").
- Manual check: TOC buttons land on the correct section; `/work/` cards
  land on the correct era page.
