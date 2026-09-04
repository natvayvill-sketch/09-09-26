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
