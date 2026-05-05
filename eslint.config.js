import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: {
    catalogs: false,
  },
  vue: true,
}, {
  files: ['apps/api/src/**/*.ts'],
  rules: {
    'ts/consistent-type-imports': 'off',
  },
})
