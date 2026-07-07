import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const buddyVersion = JSON.parse(
  readFileSync(new URL('./buddy.version.json', import.meta.url), 'utf8'),
) as { version?: string }

export default defineConfig({
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
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
})
