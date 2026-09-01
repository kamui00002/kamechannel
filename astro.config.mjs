import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// おなけんブログ（onakenblog）と同じ土台。
// 静的出力を Cloudflare Workers Static Assets で配信する。
export default defineConfig({
  site: 'https://kamechannel.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [sitemap()],
});
