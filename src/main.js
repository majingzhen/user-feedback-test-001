import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/app.vue'
import '@/style.css'

createApp(App).use(createPinia()).mount('#app')
