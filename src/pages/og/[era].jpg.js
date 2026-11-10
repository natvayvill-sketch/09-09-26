// Link-preview image for each era page: /og/<era-slug>.jpg
// The era's map plus its character art (up to three polaroids).
import { getCollection } from 'astro:content';
import { visibleProjects, groupByEra, slugifyEra, showcaseImages } from '../../lib/projects.js';
import { previewImage } from '../../lib/og.js';

export async function getStaticPaths() {
  const eras = groupByEra(visibleProjects(await getCollection('projects')));
  return eras.map(({ era, characters }) => ({
    params: { era: slugifyEra(era) },
    props: { images: [characters[0].data.cover, ...showcaseImages(characters)].slice(0, 3) },
  }));
}

export async function GET({ props }) {
  return new Response(await previewImage(props.images), {
    headers: { 'Content-Type': 'image/jpeg' },
  });
}
