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
    const type = character.data.type;
    if (!map.has(type)) {
      map.set(type, []);
      order.push(type);
    }
    map.get(type).push(character);
  }
  return order.map((type) => ({ type, characters: map.get(type) }));
}
