import { describe, it, expect } from 'vitest';
import { isVisible, sortByDateDesc, visibleProjects, matchesFilter, slugifyEra, groupByEra, groupByType, isVintageEra, eraDescription, showcaseImages } from './projects.js';

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
    const xipetotl = project({ type: ['god'] });
    const leah = project({ type: ['Faulkner'] });
    const anotherGod = project({ type: ['god'] });
    const result = groupByType([xipetotl, leah, anotherGod]);
    expect(result).toEqual([
      { type: 'god', characters: [xipetotl, anotherGod] },
      { type: 'Faulkner', characters: [leah] },
    ]);
  });

  it('groups a character under only its first listed type when it has several', () => {
    const map = project({ type: ['Map', 'Xipetotl'] });
    const leah = project({ type: ['Faulkner'] });
    const result = groupByType([map, leah]);
    expect(result).toEqual([
      { type: 'Map', characters: [map] },
      { type: 'Faulkner', characters: [leah] },
    ]);
  });
});

describe('isVintageEra', () => {
  it('returns true for eras in the vintage list', () => {
    expect(isVintageEra('The Age of Gods')).toBe(true);
    expect(isVintageEra('The Age of Man')).toBe(true);
    expect(isVintageEra('The Rapture')).toBe(true);
  });

  it('returns false for eras not in the vintage list', () => {
    expect(isVintageEra('Common Era')).toBe(false);
    expect(isVintageEra('Reperations')).toBe(false);
    expect(isVintageEra('Nebula Era')).toBe(false);
  });
});

describe('eraDescription', () => {
  const withCaptions = (...captions) =>
    project({ panels: captions.map((caption, i) => ({ title: `P${i}`, image: '/x.webp', caption })) });

  it('uses the first caption that has text', () => {
    expect(eraDescription('Nebula Era', [withCaptions('', 'A scarred land remained.')])).toBe('A scarred land remained.');
  });

  it('shortens long captions at a word break, under 160 characters', () => {
    const long = 'The rise of humanity began to push the magical to the outskirts of society. '.repeat(4).trim();
    const text = eraDescription('Nebula Era', [withCaptions(long)]);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith('…')).toBe(true);
    expect(long.startsWith(text.slice(0, -1))).toBe(true);
    expect(text.at(-2)).not.toBe(' ');
  });

  it('falls back to a plain line when no caption has text', () => {
    expect(eraDescription('Nebula Era', [withCaptions('', '  ')])).toBe("Nebula Era, a chapter of Lee Vaylon's art scrapbook.");
  });
});

describe('showcaseImages', () => {
  const withPanels = (cover, ...panels) =>
    project({ cover, panels: panels.map(([title, image]) => ({ title, image, caption: '' })) });

  it('keeps character art and skips maps, covers and repeated placeholders', () => {
    const gods = withPanels(
      '/c.webp',
      ['Map', '/map.webp'],
      ['Xipetotl', '/x.webp'],
      ['Love', '/q.webp'],
      ['Wind', '/q.webp'],
    );
    const man = withPanels('/m.webp', ['Map', '/m.webp'], ['Esmeray', '/e.webp']);
    expect(showcaseImages([gods, man])).toEqual(['/x.webp', '/e.webp']);
  });

  it('returns nothing for a map-only era', () => {
    expect(showcaseImages([withPanels('/c.webp', ['Map', '/c.webp'])])).toEqual([]);
  });
});
