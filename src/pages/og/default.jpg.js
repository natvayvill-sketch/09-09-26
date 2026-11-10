// Link-preview image for pages without their own: /og/default.jpg
// Character art from featured projects, topped up with covers if there's too little.
import { getCollection } from 'astro:content';
import { visibleProjects, showcaseImages } from '../../lib/projects.js';
import { previewImage } from '../../lib/og.js';

export async function GET() {
  const projects = visibleProjects(await getCollection('projects'));
  const featured = projects.filter((p) => p.data.featured);
  const images = [...new Set([...showcaseImages(featured), ...featured.map((p) => p.data.cover)])].slice(0, 3);
  return new Response(await previewImage(images), {
    headers: { 'Content-Type': 'image/jpeg' },
  });
}
