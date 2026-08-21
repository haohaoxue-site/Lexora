import { createApp } from 'vue'
import App from '@/App.vue'
import { createDesktopRouter } from '@/router'
import '@/assets/styles/index.scss'
import 'virtual:uno.css'

createApp(App)
  .use(createDesktopRouter())
  .mount('#app')
