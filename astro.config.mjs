import { defineConfig } from 'astro/config';

export default defineConfig({
  // The live address, used for absolute links in link previews. Netlify sets
  // URL during its builds, so this follows the site if it gets a new domain.
  site: process.env.URL ?? 'https://celadon-caramel-541f97.netlify.app',
});
