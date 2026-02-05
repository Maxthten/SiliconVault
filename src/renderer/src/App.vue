<script setup lang="ts">
import { darkTheme, GlobalThemeOverrides, NConfigProvider, NGlobalStyle, NMessageProvider, NDialogProvider } from 'naive-ui'
import Sidebar from './components/Sidebar.vue'
import BottomBar from './components/BottomBar.vue'

// 定制 Naive UI 主题色
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0A84FF',
    primaryColorHover: '#409CFF',
    borderRadius: '10px',
    fontFamily: '"SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif'
  },
  Card: { color: 'rgba(28, 28, 30, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }
}
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
              <transition name="fade-slide" mode="out-in">
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
  /* 稍微调整了渐变，使其更有质感 */
  background: linear-gradient(145deg, #101014 0%, #000000 100%);
  color: white;
}

.main-content {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

/* === 📱 移动端适配核心 CSS (强制覆盖) === */

/* --- 1. 默认状态 (电脑 > 768px) --- */
.mobile-nav { display: none !important; }
.desktop-sidebar { display: flex !important; }

/* --- 2. 手机状态 (屏幕 <= 768px) --- */
@media (max-width: 768px) {
  
  .mobile-nav { display: flex !important; }
  .desktop-sidebar { display: none !important; }

  .app-layout { flex-direction: column; }

  /* 🔥 修正：底部留白增加到 80px，因为 BottomBar 变高了 */
  .main-content {
    padding-bottom: 0px; 
  }
}

/* === 页面切换动画 === */
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-slide-enter-from { opacity: 0; transform: translateX(15px); }
.fade-slide-leave-to { opacity: 0; transform: translateX(-5px); }

/* 隐藏滚动条但保留滚动功能 */
::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
</style>