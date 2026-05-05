import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  clean: true,
  sourcemap: true,
  external: [/node_modules/],
  unbundle: true,
})
