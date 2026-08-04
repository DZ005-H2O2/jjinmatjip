import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves from /<repo-name>/ — CI sets BASE_PATH accordingly.
  base: process.env.BASE_PATH || "/",
  server: {
    proxy: {
      // local dev: frontend /api → wrangler dev worker
      "/api": "http://localhost:8787",
    },
  },
});
