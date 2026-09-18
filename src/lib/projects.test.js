import { describe, it, expect } from 'vitest';
import { isVisible, sortByDateDesc, visibleProjects, matchesFilter, slugifyEra, groupByEra, groupByType } from './projects.js';

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
