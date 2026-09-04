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
