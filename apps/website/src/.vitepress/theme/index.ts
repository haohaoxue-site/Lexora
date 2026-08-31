import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import LandingPage from './components/landing/LandingPage.vue'
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LandingPage', LandingPage)
  },
} satisfies Theme
