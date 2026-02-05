import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 👈 别忘了导入这一行

const app = createApp(App)
app.use(router) // 👈 别忘了挂载这一行
app.mount('#app')