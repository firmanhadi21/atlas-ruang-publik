import { defineConfig } from "vite";
import { resolve } from "node:path";

// Atlas Ruang Publik: a landing page plus one page per study.
// Adding a study means adding one line to `input` below.
// `base` is the repository name (GitHub Pages project site). Set it to "/" if this moves
// to a custom domain such as an Undip subdomain.
export default defineConfig({
  base: "/atlas-ruang-publik/",
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        rokokSekolahSemarang: resolve(__dirname, "rokok-sekolah-semarang/index.html"),
      },
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    ),
  },
});
