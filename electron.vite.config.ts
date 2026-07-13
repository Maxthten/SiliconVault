import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(projectRoot, 'src/renderer/src')
      }
    },
    plugins: [vue()],
    server: {
      port: 5173,      
      strictPort: false 
    }
  }
})
