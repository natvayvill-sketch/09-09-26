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

const VINTAGE_ERAS = ['The Age of Gods', 'The Age of Man', 'The Rapture'];

export function isVintageEra(era) {
  return VINTAGE_ERAS.includes(era);
}

export function slugifyEra(era) {
  return era
    .toLowerCase()
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
    const [type] = character.data.type;
    if (!map.has(type)) {
      map.set(type, []);
      order.push(type);
    }
    map.get(type).push(character);
  }
  return order.map((type) => ({ type, characters: map.get(type) }));
}

const DESCRIPTION_MAX = 160;

/** Link-preview description for an era page: its first caption, shortened to fit. */
export function eraDescription(era, characters) {
  const caption = characters
    .flatMap((character) => character.data.panels ?? [])
    .map((panel) => panel.caption.trim())
    .find((text) => text !== '');
  if (!caption) return `${era}, a chapter of Lee Vaylon's art scrapbook.`;
  if (caption.length <= DESCRIPTION_MAX) return caption;
  const cut = caption.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.-]+$/, '')}…`;
}

/**
 * Character/feature art worth showing in a link preview: each panel image
 * that isn't a map or the project's cover, skipping images that appear on
 * more than one panel (those are placeholders, like the "?" art).
 */
export function showcaseImages(characters) {
  const panels = characters.flatMap((character) =>
    (character.data.panels ?? []).map((panel) => ({ ...panel, cover: character.data.cover })),
  );
  const uses = new Map();
  for (const { image } of panels) uses.set(image, (uses.get(image) ?? 0) + 1);
  const picks = panels
    .filter((p) => p.image !== p.cover && p.title.trim().toLowerCase() !== 'map' && uses.get(p.image) === 1)
    .map((p) => p.image);
  return [...new Set(picks)];
}
