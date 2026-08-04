import { defineConfig } from "vite";
import { resolve } from "node:path";

// Atlas Ruang Publik。ランディング + studi ごとに1ページ、の多ページ構成。
// 研究が増えたら input に1行足すだけで済む形にしてある。
// base はリポジトリ名（GitHub Pages のプロジェクトページ）。独自ドメイン
// （Undip のサブドメイン等）に移す場合は "/" にする。
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
