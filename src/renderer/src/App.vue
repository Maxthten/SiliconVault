<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { darkTheme, GlobalThemeOverrides, NConfigProvider, NGlobalStyle, NMessageProvider, NDialogProvider } from 'naive-ui'
import Sidebar from './components/Sidebar.vue'
import { DEFAULT_ANIMATION } from '@renderer/config/animations'

// 定制 Naive UI 主题色 & 全局组件质感
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0A84FF',
    primaryColorHover: '#409CFF',
    borderRadius: '10px',
    fontFamily: '"SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif'
  },
  Card: { 
    color: 'rgba(28, 28, 30, 0.6)', 
    borderColor: 'rgba(255, 255, 255, 0.1)' 
  },
  // --- 新增：全局消息通知质感升级 (Matte Floating Style) ---
  Message: {
    // 背景：高密度哑光黑 (略带透明)
    color: 'rgba(28, 28, 30, 0.95)',
    colorSuccess: 'rgba(28, 28, 30, 0.95)', 
    colorError: 'rgba(28, 28, 30, 0.95)',
    colorWarning: 'rgba(28, 28, 30, 0.95)',
    colorInfo: 'rgba(28, 28, 30, 0.95)',
    
    // 字体与图标
    textColor: '#fff',
    iconColorSuccess: '#30D158', // iOS Green
    iconColorError: '#FF453A',   // iOS Red
    iconColorWarning: '#FF9F0A', // iOS Orange
    iconColorInfo: '#0A84FF',    // iOS Blue

    // 结构：更圆润、更精致
    borderRadius: '12px',
    padding: '12px 20px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)', // 深邃投影
    maxWidth: '380px'
  }
}

// 动态动画状态
const currentTransition = ref(DEFAULT_ANIMATION)

const updateTransition = () => {
  const saved = localStorage.getItem('ui-transition')
  currentTransition.value = saved || DEFAULT_ANIMATION
}

onMounted(() => {
  updateTransition()
  window.addEventListener('ui-transition-changed', updateTransition)
})

onUnmounted(() => {
  window.removeEventListener('ui-transition-changed', updateTransition)
})
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        
        <div class="app-layout">
          <Sidebar class="desktop-sidebar" />

          <div class="main-content">
            <router-view v-slot="{ Component }">
              <transition :name="currentTransition" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </div>

          <BottomBar class="mobile-nav" />

        </div>

      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/* 全局基础样式 */
body { margin: 0; background-color: #000; overflow: hidden; user-select: none; }

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(145deg, #101014 0%, #000000 100%);
  color: white;
}

.main-content {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  perspective: 1000px;
}

/* === 移动端适配 === */
.mobile-nav { display: none !important; }
.desktop-sidebar { display: flex !important; }

@media (max-width: 768px) {
  .mobile-nav { display: flex !important; }
  .desktop-sidebar { display: none !important; }
  .app-layout { flex-direction: column; }
  .main-content { padding-bottom: 0px; }
}

/* === 动画库 === */

/* 1. Cinematic Drift */
.fade-slide-enter-active {
  transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform, opacity, filter;
}
.fade-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
  will-change: transform, opacity, filter;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: scale(1.02) translateY(10px);
  filter: blur(4px); 
}
.fade-slide-leave-to {
  opacity: 0;
  transform: scale(0.98);
  filter: blur(2px);
}

/* 2. Simple Fade */
.simple-fade-enter-active,
.simple-fade-leave-active {
  transition: opacity 0.25s ease;
}
.simple-fade-enter-from,
.simple-fade-leave-to {
  opacity: 0;
}

/* 3. Zoom Out */
.zoom-out-enter-active,
.zoom-out-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
}
.zoom-out-enter-from {
  opacity: 0;
  transform: scale(0.92);
}
.zoom-out-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* 4. None */
.none-enter-active,
.none-leave-active {
  transition: none !important;
}

::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
</style>