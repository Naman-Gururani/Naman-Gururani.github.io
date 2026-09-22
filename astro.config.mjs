// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://naman-gururani.github.io',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // One theme per skin, not one dark theme on both. `defaultColor:
      // false` stops Shiki baking a colour into every span, so each
      // token carries --shiki-light/--shiki-dark and global.css picks
      // the skin the same way it picks every other token.
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
});
