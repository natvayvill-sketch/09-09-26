import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
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
  }),
});

export const collections = { projects };
