import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const buddyVersion = JSON.parse(
  readFileSync(new URL('./buddy.version.json', import.meta.url), 'utf8'),
) as { version?: string }

export default defineConfig({
  cacheDir: fileURLToPath(new URL('./.output/cache/vite', import.meta.url)),
  define: {
    __LEXORA_BUDDY_VERSION__: JSON.stringify(buddyVersion.version ?? ''),
  },
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@buddy-electron': fileURLToPath(new URL('./electron', import.meta.url)),
      '@buddy-shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./.output/build/renderer-preview', import.meta.url)),
    target: 'esnext',
  },
})
