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
}, {
  files: ['apps/web/src/**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@haohaoxue/lexora-contracts',
        allowTypeImports: true,
        message: '运行时契约值请使用领域子入口，类型继续使用 import type。',
      }, {
        name: '@haohaoxue/lexora-shared',
        allowTypeImports: true,
        message: 'shared 函数请使用具体子入口，避免根 barrel 扩大首包。',
      }, {
        name: 'element-plus',
        allowTypeImports: true,
        message: 'Element Plus 运行时请使用自动导入、@/utils/element-plus 或具体子入口，类型继续使用 import type。',
      }],
    }],
  },
}, {
  files: ['packages/shared/src/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@haohaoxue/lexora-contracts',
        allowTypeImports: true,
        message: 'shared 包内运行时契约值请使用 contracts 领域子入口，类型继续使用 import type。',
      }],
    }],
  },
})
