import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^next-intl$/, replacement: 'use-intl' },
      { find: /^next\/navigation$/, replacement: r('shims/next-navigation.ts') },
      { find: /^@\/i18n\/navigation$/, replacement: r('shims/i18n-navigation.tsx') },
      { find: /^@\/i18n\/routing$/, replacement: r('shims/i18n-routing.ts') },
      { find: /^@\/features\/auth\/actions$/, replacement: r('shims/auth-actions.ts') },
      { find: /^@\/lib\/accounts-enabled$/, replacement: r('shims/accounts-enabled.ts') },
      { find: /^@\//, replacement: r('../src') + '/' },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { outDir: r('dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
