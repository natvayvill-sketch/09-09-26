// The rules every project file in src/content/projects must follow.
// Shared by content.config.ts (the site) and projectFiles.test.js (the check
// that names the broken field before a project can silently disappear).
import { z } from 'astro/zod';

export const projectSchema = z.object({
  title: z.string(),
  era: z.string().min(1),
  type: z.array(z.string().min(1)).min(1),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  cover: z.string(),
  panels: z
    .array(
      z.object({
        title: z.string().min(1),
        image: z.string(),
        caption: z.string(),
      }),
    )
    .min(1),
  tools: z.array(z.string()).default([]),
  links: z
    .array(z.object({ label: z.string(), url: z.string().url() }))
    .default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
});
