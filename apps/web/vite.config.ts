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

const editorDependencyDedupe = [
  '@hocuspocus/provider',
  '@tiptap/core',
  '@tiptap/extension-collaboration',
  '@tiptap/extension-collaboration-cursor',
  '@tiptap/pm',
  '@tiptap/starter-kit',
  '@tiptap/vue-3',
  '@tiptap/y-tiptap',
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-transform',
  'prosemirror-view',
  'y-protocols',
  'yjs',
]

const editorOptimizedDependencies = [
  '@hocuspocus/provider',
  '@tiptap/core',
  '@tiptap/extension-collaboration',
  '@tiptap/extension-collaboration-cursor',
  '@tiptap/extension-color',
  '@tiptap/extension-highlight',
  '@tiptap/extension-image',
  '@tiptap/extension-placeholder',
  '@tiptap/extension-table',
  '@tiptap/extension-table-cell',
  '@tiptap/extension-table-header',
  '@tiptap/extension-table-row',
  '@tiptap/extension-task-item',
  '@tiptap/extension-task-list',
  '@tiptap/extension-text-style',
  '@tiptap/pm/model',
  '@tiptap/pm/state',
  '@tiptap/pm/view',
  '@tiptap/starter-kit',
  '@tiptap/vue-3',
  '@tiptap/vue-3/menus',
  '@tiptap/y-tiptap',
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-transform',
  'prosemirror-view',
  'y-protocols/awareness',
  'yjs',
  'element-plus/es',
]

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

  if (id.includes('/katex/')) {
    return 'tiptap-katex'
  }

  if (id.includes('/highlight.js/') || id.includes('/lowlight/')) {
    return 'tiptap-highlight'
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
      dedupe: editorDependencyDedupe,
    },
    optimizeDeps: {
      include: editorOptimizedDependencies,
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
