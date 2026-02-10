<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { useI18n } from 'vue-i18n' // 引入国际化钩子
import { darkTheme, lightTheme, NConfigProvider, NGlobalStyle, NMessageProvider, NDialogProvider } from 'naive-ui'
import Sidebar from './components/Sidebar.vue'
import TitleBar from './components/TitleBar.vue' 
import { DEFAULT_ANIMATION } from '@renderer/config/animations'
import { getThemeOverrides } from '@renderer/utils/theme'

const { locale } = useI18n() // 获取当前语言状态

// 临时切换语言方法
const toggleLanguage = () => {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}

// 主题状态
const isDark = ref(true)

// Naive UI 主题配置
const currentNaiveTheme = computed(() => (isDark.value ? darkTheme : lightTheme))
const currentThemeOverrides = computed(() => getThemeOverrides(isDark.value))


const toggleTheme = (event?: MouseEvent) => {
  // 基础切换逻辑
  const switchThemeLogic = () => {
    isDark.value = !isDark.value
    const themeValue = isDark.value ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', themeValue)
    localStorage.setItem('app-theme', themeValue)
  }

  // 降级处理
  // @ts-ignore
  if (!document.startViewTransition || !event) {
    switchThemeLogic()
    return
  }

  // 1. 性能戒严：给 html 加标记
  document.documentElement.classList.add('animating')

  // 2. 计算几何
  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )

  // 3. 执行视图过渡
  // @ts-ignore
  const transition = document.startViewTransition(async () => {
    switchThemeLogic()
    await nextTick()
  })

  // 4. 自定义动画
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`
        ]
      },
      {
        duration: 500,
        easing: 'ease-in',
        pseudoElement: '::view-transition-new(root)'
      }
    )
  })

  // 5. 解除戒严
  transition.finished.then(() => {
    document.documentElement.classList.remove('animating')
  })
}

// 依赖注入
provide('toggleTheme', toggleTheme)
provide('isDark', isDark)

// 路由过渡动画管理
const currentTransition = ref(DEFAULT_ANIMATION)
const updateTransition = () => {
  const saved = localStorage.getItem('ui-transition')
  currentTransition.value = saved || DEFAULT_ANIMATION
}

// 窗口限制提示逻辑
const limitOpacity = ref(0)
const LIMIT_W = 800
const LIMIT_H = 640
const BUFFER = 20

const handleResize = () => {
  const w = window.innerWidth
  const h = window.innerHeight
  let wScore = 0
  let hScore = 0
  
  if (w < LIMIT_W) wScore = Math.min(Math.max((LIMIT_W - w) / BUFFER, 0), 1)
  if (h < LIMIT_H) hScore = Math.min(Math.max((LIMIT_H - h) / BUFFER, 0), 1)
  
  limitOpacity.value = (wScore * 0.5) + (hScore * 0.5)
}

onMounted(() => {
  // 初始化主题
  const savedTheme = localStorage.getItem('app-theme')
  if (savedTheme === 'light') {
    isDark.value = false
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    isDark.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  }

  updateTransition()
  window.addEventListener('ui-transition-changed', updateTransition)
  window.addEventListener('resize', handleResize)
  handleResize()
})

onUnmounted(() => {
  window.removeEventListener('ui-transition-changed', updateTransition)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <n-config-provider 
    :theme="currentNaiveTheme" 
    :theme-overrides="currentThemeOverrides"
  >
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        
        <div class="debug-lang-switch" @click="toggleLanguage">
          {{ locale === 'zh-CN' ? 'Switch to EN' : '切换中文' }}
        </div>

        <div 
          class="minimal-glow" 
          :style="{ opacity: limitOpacity }"
        ></div>

        <div class="app-root-container">
          <TitleBar />

          <div class="app-layout">
            <Sidebar class="sidebar-area" />

            <div class="main-content">
              <router-view v-slot="{ Component }">
                <transition :name="currentTransition" mode="out-in">
                  <component :is="Component" />
                </transition>
              </router-view>
            </div>
          </div>
        </div>

      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/* 临时按钮样式 */
.debug-lang-switch {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 10000;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 20px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
  user-select: none;
}
.debug-lang-switch:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}

/* 全局基础设置 */
body { 
  margin: 0; 
  overflow: hidden; 
  user-select: none; 
  background-color: var(--bg-body); 
}

/* --- View Transition 核心配置 --- */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
  will-change: clip-path;
}

::view-transition-new(root) {
  z-index: 9999; 
}
::view-transition-old(root) {
  z-index: 1;
}

/* --- 性能戒严模式 --- */
html.animating body,
html.animating .app-root-container,
html.animating .sidebar,
html.animating .title-bar {
  transition: none !important;
}

html.animating .sidebar {
  backdrop-filter: none !important;
}

/* 窗口尺寸过小提示 */
.minimal-glow {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 9999;
  box-shadow: var(--limit-glow-style);
  transition: opacity 0.2s ease;
}

.smart-item {
  content-visibility: auto; /* 核心属性：视口外不渲染 */
  contain-intrinsic-size: 1px 50px; /* 预估高度，防止滚动条抖动 */
}

/* --- [方案B] 布局隔离优化 --- */
.app-root-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg-app-gradient);
  color: var(--text-primary);
  transition: background 0.3s ease, color 0.3s ease;
  position: relative;
  z-index: 1;
  contain: layout; /* 隔离全局布局 */
}

.app-layout {
  display: flex;
  flex: 1; 
  overflow: hidden; 
  position: relative;
  contain: layout; /* 隔离主布局 */
}

.sidebar-area { 
  display: flex; 
  flex-shrink: 0; 
  contain: layout style; /* 强隔离：侧边栏变化不影响右侧 */
}

.main-content { 
  flex: 1; 
  position: relative; 
  overflow-y: auto; 
  overflow-x: hidden; 
  contain: layout; /* 隔离内容区：内部重排不影响外部 */
}

/* 路由动画 */
.fade-slide-enter-active { transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 1, 1); }
.fade-slide-enter-from { opacity: 0; transform: scale(1.02) translateY(10px); filter: blur(4px); }
.fade-slide-leave-to { opacity: 0; transform: scale(0.98); filter: blur(2px); }

.simple-fade-enter-active, .simple-fade-leave-active { transition: opacity 0.25s ease; }
.simple-fade-enter-from, .simple-fade-leave-to { opacity: 0; }
.none-enter-active, .none-leave-active { transition: none !important; }

::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
</style>