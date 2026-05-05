export default async function setupAssets() {
  await import('@unocss/reset/tailwind.css')
  await import('element-plus/dist/index.css')
  await import('element-plus/theme-chalk/dark/css-vars.css')
  await import('virtual:uno.css')
  await import('@/assets/scss/index.scss')
  await import('@/assets/scss/override.css')
}
