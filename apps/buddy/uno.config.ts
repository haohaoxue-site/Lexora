import { defineConfig, presetUno } from 'unocss'

const alphaLevels = [10, 20, 30, 40, 50, 60, 70, 80] as const

const semanticColorTokens = {
  'primary': '--buddy-accent-primary',
  'success': '--buddy-accent-success',
  'warning': '--buddy-accent-warning',
  'danger': '--buddy-accent-danger',
  'main': '--buddy-text-primary',
  'regular': '--buddy-text-regular',
  'secondary': '--buddy-text-secondary',
  'placeholder': '--buddy-text-placeholder',
  'border': '--buddy-border-base',
  'border-light': '--buddy-border-light',
  'fill': '--buddy-fill-base',
  'fill-light': '--buddy-fill-light',
  'body': '--buddy-bg-body',
  'surface': '--buddy-bg-surface',
  'surface-raised': '--buddy-bg-surface-raised',
} as const

const themeColors = {
  ...Object.fromEntries(
    Object.entries(semanticColorTokens).map(([name, token]) => [name, `var(${token})`]),
  ),
  ...Object.fromEntries(
    Object.entries(semanticColorTokens).flatMap(([name, token]) =>
      alphaLevels.map(level => [
        `${name}-a${level}`,
        `color-mix(in srgb, var(${token}) ${level}%, transparent)`,
      ]),
    ),
  ),
}

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: themeColors,
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
  },
})
