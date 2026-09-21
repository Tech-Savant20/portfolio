// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://abhyudaytomar.com",
  // Pages build to /cloud.html etc., which Workers static assets serve at /cloud.
  trailingSlash: "never",
  build: { format: "file" },
  // Lossless whitespace removal. The v7 default ('jsx') drops spaces between
  // inline elements, which breaks running text with links in it.
  compressHTML: true,
  prefetch: { defaultStrategy: "hover" },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
