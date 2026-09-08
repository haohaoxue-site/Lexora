import { createApp } from 'vue'
import App from '@/App.vue'
import { createDesktopRouter } from '@/app/router'
import '@/theme/index.scss'
import 'virtual:uno.css'

createApp(App)
  .use(createDesktopRouter())
  .mount('#app')
