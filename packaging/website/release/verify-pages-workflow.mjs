import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { classifyCiScope } from '../../../infrastructure/scripts/resolve-ci-scope.mjs'
import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const workflowPath = '.github/workflows/website-pages.yml'

export function verifyWebsitePagesWorkflow(cwd = repoRoot) {
  const errors = []
  const workflow = readRequiredFile(cwd, workflowPath, errors)
  const rootPackage = readPackage(cwd, 'package.json', errors)
  const websitePackage = readPackage(cwd, 'apps/website/package.json', errors)

  verifyTriggerBoundary(workflow, errors)
  verifyBuildJob(workflow, errors)
  verifyDeployJob(workflow, errors)
  verifyPinnedActions(workflow, errors)
  verifyScripts(rootPackage, websitePackage, errors)
  verifyCiScope(errors)

  return errors
}

function verifyCiScope(errors) {
  const cases = [
    [['apps/website/src/index.md'], { buddy: false, website: true, quality: false }],
    [['.github/workflows/website-pages.yml'], { buddy: false, website: true, quality: false }],
    [['packaging/website/release/verify-pages-workflow.mjs'], { buddy: false, website: true, quality: false }],
    [['apps/web/src/main.ts'], { buddy: false, website: false, quality: true }],
    [['apps/buddy/electron/main/index.ts'], { buddy: true, website: false, quality: true }],
    [['pnpm-lock.yaml'], { buddy: true, website: false, quality: true }],
    [['README.md'], { buddy: true, website: false, quality: true }],
  ]

  if (cases.some(([files, expected]) => (
    JSON.stringify(classifyCiScope(files)) !== JSON.stringify(expected)
  ))) {
    errors.push('CI 必须仅为 Website 输入启用 Website 构建')
  }
}

function verifyTriggerBoundary(workflow, errors) {
  const trigger = `on:
  push:
    branches: [master]
    paths:
      - 'apps/website/**'
      - .github/workflows/website-pages.yml
  workflow_dispatch:
`

  requireFragments(workflow, [
    'name: Website Pages',
    trigger,
    'permissions:\n  contents: read',
    'group: website-pages',
    'cancel-in-progress: false',
  ], errors, 'Website Pages 必须仅由 master 的 Website 变更或手动运行触发')
  forbidFragments(workflow, [
    'pull_request:',
    'tags:',
    'paths-ignore:',
    'contents: write',
    'cancel-in-progress: true',
  ], errors, 'Website Pages 不得扩大自动发布边界或授予仓库写权限')
}

function verifyBuildJob(workflow, errors) {
  requireFragments(workflow, [
    'build:',
    'name: Build Website',
    'runs-on: ubuntu-24.04',
    'timeout-minutes: 15',
    'pages: read',
    'persist-credentials: false',
    'node-version-file: .node-version',
    'cache-dependency-path: pnpm-lock.yaml',
    'id: pages',
    'pnpm --filter @haohaoxue/lexora --filter @haohaoxue/lexora-website install --frozen-lockfile',
    `WEBSITE_BASE_PATH: ${githubExpression('steps.pages.outputs.base_path')}`,
    'pnpm --filter @haohaoxue/lexora-website build',
    'path: apps/website/dist',
  ], errors, 'Website Pages 必须在只读构建任务中生成并上传独立产物')
}

function verifyDeployJob(workflow, errors) {
  requireFragments(workflow, [
    'deploy:',
    'name: Deploy GitHub Pages',
    'needs: build',
    'timeout-minutes: 10',
    'pages: write',
    'id-token: write',
    'name: github-pages',
    `url: ${githubExpression('steps.deployment.outputs.page_url')}`,
    'id: deployment',
  ], errors, 'Website Pages 只能在构建完成后由 github-pages 环境执行部署')

  if ((workflow.match(/pages: write/g) ?? []).length !== 1)
    errors.push('只有 Website 部署任务可以获得 Pages 写权限')
  if ((workflow.match(/id-token: write/g) ?? []).length !== 1)
    errors.push('只有 Website 部署任务可以获得 OIDC 写权限')
}

function verifyPinnedActions(workflow, errors) {
  const actions = [
    'actions/checkout',
    'pnpm/action-setup',
    'actions/setup-node',
    'actions/configure-pages',
    'actions/upload-pages-artifact',
    'actions/deploy-pages',
  ]

  for (const action of actions) {
    const reference = new RegExp(`uses: ${escapeRegExp(action)}@([a-f0-9]{40})(?:\\s|$)`)
    if (!reference.test(workflow))
      errors.push(`${action} 必须固定到完整提交 SHA`)
  }
}

function verifyScripts(rootPackage, websitePackage, errors) {
  requireScripts(websitePackage, {
    'dev': 'vitepress dev src',
    'build': 'vitepress build src',
    'preview': 'vitepress preview src',
    'lint': 'eslint .',
    'lint:fix': 'eslint . --fix',
  }, errors, 'Website')
  requireScripts(rootPackage, {
    'dev:website': 'pnpm --filter @haohaoxue/lexora-website dev',
    'build:website': 'pnpm --filter @haohaoxue/lexora-website build',
    'preview:website': 'pnpm --filter @haohaoxue/lexora-website preview',
    'check:website': 'node packaging/website/release/verify-pages-workflow.mjs && pnpm --filter @haohaoxue/lexora-website lint && pnpm --filter @haohaoxue/lexora-website build',
  }, errors, '根 workspace')

  if (!rootPackage?.scripts?.dev?.includes(`--filter '!@haohaoxue/lexora-website'`))
    errors.push('根 dev 必须排除独立启动的 Website')
  if (Object.keys(websitePackage?.scripts ?? {}).some(script => script.startsWith('docs:')))
    errors.push('Website 脚本不得继续使用迁移前的 docs 前缀')
}

function readRequiredFile(cwd, path, errors) {
  const absolutePath = resolve(cwd, path)
  if (!existsSync(absolutePath)) {
    errors.push(`缺少 ${path}`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function readPackage(cwd, path, errors) {
  const content = readRequiredFile(cwd, path, errors)
  if (!content)
    return undefined
  try {
    return JSON.parse(content)
  }
  catch {
    errors.push(`${path} 必须是有效 JSON`)
    return undefined
  }
}

function requireScripts(pkg, expected, errors, label) {
  for (const [name, command] of Object.entries(expected)) {
    if (pkg?.scripts?.[name] !== command)
      errors.push(`${label} 脚本 ${name} 必须是 ${command}`)
  }
}

function requireFragments(content, fragments, errors, message) {
  if (fragments.some(fragment => !content.includes(fragment)))
    errors.push(message)
}

function forbidFragments(content, fragments, errors, message) {
  if (fragments.some(fragment => content.includes(fragment)))
    errors.push(message)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function githubExpression(value) {
  return ['$', '{{ ', value, ' }}'].join('')
}

if (process.argv[1] === import.meta.filename) {
  const errors = verifyWebsitePagesWorkflow()
  if (errors.length > 0)
    throw new Error(`Website Pages workflow contract failed:\n- ${errors.join('\n- ')}`)
  writeOutput('Website Pages workflow contract passed')
}
