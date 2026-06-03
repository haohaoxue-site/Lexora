import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts', 'src/cli/reset-system-admin-password.ts'],
  format: 'esm',
  clean: true,
  sourcemap: true,
  deps: {
    alwaysBundle: [/^@haohaoxue\/samepage-(?:contracts|shared)(?:\/.*)?$/],
  },
  unbundle: true,
})
