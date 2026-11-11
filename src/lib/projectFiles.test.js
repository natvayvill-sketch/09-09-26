// Checks every project file the way the site will. When a project breaks,
// the dev server quietly hides it and Netlify's deploy fails (leaving the old
// site up), so this names the exact file and field instead. Bugs log #2, #3.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { projectSchema } from './projectSchema.js';
import { slugifyEra, isVisible } from './projects.js';

const DIR = 'src/content/projects';
const files = readdirSync(DIR).filter((name) => name.endsWith('.md'));

/** The YAML between the opening and closing --- lines, or an error message. */
function frontmatter(name) {
  const text = readFileSync(join(DIR, name), 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { error: 'has no front matter between --- lines at the top' };
  try {
    return { data: yaml.load(match[1]) ?? {} };
  } catch (e) {
    return { error: `has a YAML formatting error: ${e.reason ?? e.message} (line ${(e.mark?.line ?? 0) + 2})` };
  }
}

function describeIssue(issue, data) {
  const where = issue.path.length ? issue.path.join(' → ') : '(whole file)';
  const value = issue.path.reduce((v, key) => (v == null ? undefined : v[key]), data);
  return `${where}: ${plainMessage(issue, value)}`;
}

/** Zod's wording, rephrased for the common mistakes. */
function plainMessage(issue, value) {
  if (issue.code === 'too_small' && issue.origin === 'string') return "can't be empty";
  if (issue.code === 'too_small' && issue.origin === 'array') return `needs at least ${issue.minimum} item(s)`;
  if (issue.code === 'invalid_type' && issue.expected === 'date') return 'is not a real date; write it like 2025-05-01';
  if (issue.code === 'invalid_type' && value === undefined) return `is missing (expected ${issue.expected})`;
  if (issue.code === 'invalid_type') return `should be ${issue.expected === 'array' ? 'a [list]' : `a ${issue.expected}`}`;
  if (issue.code === 'invalid_format' && issue.format === 'url') return 'is not a full web address (start it with https://)';
  return issue.message;
}

describe('project files', () => {
  it('finds project files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every project file matches the rules (a broken one disappears from the site)', () => {
    const problems = [];
    for (const name of files) {
      const { data, error } = frontmatter(name);
      if (error) {
        problems.push(`${name} ${error}`);
        continue;
      }
      const result = projectSchema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) problems.push(`${name}: ${describeIssue(issue, data)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every published era its own page address", () => {
    const bySlug = new Map();
    const problems = [];
    for (const name of files) {
      const { data } = frontmatter(name);
      if (!data?.era || !isVisible({ data })) continue;
      const slug = slugifyEra(data.era);
      if (slug === '') problems.push(`${name}: era "${data.era}" needs at least one letter or number`);
      const other = bySlug.get(slug);
      if (other && other.era !== data.era) {
        problems.push(`${name}: era "${data.era}" and "${other.era}" (${other.name}) would share /work/${slug}/; rename one`);
      }
      if (!other) bySlug.set(slug, { era: data.era, name });
    }
    expect(problems).toEqual([]);
  });
});
