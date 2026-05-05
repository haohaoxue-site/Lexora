import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { SERVER_PATH, SERVER_PORT } from '@haohaoxue/samepage-contracts/server'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const elementPlusResolver = ElementPlusResolver({
  importStyle: false,
})

function createManualChunk(id: string) {
  if (id.includes('/element-plus/') || id.includes('/@element-plus/')) {
    return 'element-plus'
  }

  if (id.includes('/vue-router/') || id.includes('/pinia/') || id.includes('/vue/')) {
    return 'vue-core'
  }

  if (id.includes('/@vueuse/')) {
    return 'vueuse'
  }
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      vueJsx(),
      UnoCSS(),
      AutoImport({
        dts: './auto-imports.d.ts',
        resolvers: [elementPlusResolver],
        vueTemplate: true,
      }),
      Components({
        dts: './components.d.ts',
        resolvers: [elementPlusResolver],
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        [SERVER_PATH]: {
          target: `http://localhost:${SERVER_PORT}`,
          changeOrigin: true,
          xfwd: true,
          ws: true,
        },
        '/collab': {
          target: 'ws://localhost:4100',
          xfwd: true,
          ws: true,
        },
      },
    },
    build: {
      target: 'esnext',
      rolldownOptions: {
        output: {
          manualChunks: createManualChunk,
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['./__tests__/**/*.spec.ts'],
      maxWorkers: 2,
      setupFiles: './__tests__/setup.ts',
    },
  }
})
