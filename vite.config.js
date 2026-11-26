import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// 兩種建置方式：
// - npm run build        → dist/，部署到 GitHub Pages 等網站用（JS 分成多個檔案，利於快取）
// - npm run build:local  → preview/index.html，單一檔案，可直接在電腦上雙擊開啟預覽
//
// base: './' 使用相對路徑，部署在 GitHub Pages 的子路徑（https://<帳號>.github.io/<repo>/）
// 或任何靜態主機都不需要另外設定。路由使用 hash（#meetings），不需要 404 轉址。

// 把 JS、CSS 直接寫進 index.html。瀏覽器以 file:// 開啟時不允許載入外部的 JS 模組檔，
// 內嵌在 HTML 裡就沒有這個限制。
function inlineIntoHtml() {
  return {
    name: 'inline-into-html',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      const svg = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8');
      return html.replace('href="./favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(svg)}"`);
    },
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
      if (!html) return;
      let src = html.source;
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && name.endsWith('.js')) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          src = src.replace(new RegExp(`<script[^>]*src="[^"]*${escape(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          src = src.replace(new RegExp(`<link[^>]*href="[^"]*${escape(name)}"[^>]*>`), () => `<style>${file.source}</style>`);
          delete bundle[name];
        }
      }
      html.source = src;
    },
  };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig(({ mode }) => {
  const local = mode === 'standalone';
  return {
    base: './',
    plugins: [react(), local && inlineIntoHtml()],
    server: { port: 5173, open: true },
    preview: { port: 4173 },
    build: local
      ? {
        outDir: 'preview',
        emptyOutDir: true,
        copyPublicDir: false, // favicon 改為內嵌，避免多出檔案
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 2000,
      }
      : {
        outDir: 'dist',
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          output: {
            // 把大型第三方套件拆成獨立檔案，改版時使用者只需重新下載有變動的部分
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (/[\\/](@tiptap|prosemirror-[^\\/]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname)[\\/]/.test(id)) return 'vendor-editor';
              if (/[\\/](@mui|@emotion|@popperjs|dayjs)[\\/]/.test(id)) return 'vendor-mui';
              return 'vendor';
            },
          },
        },
      },
  };
});
