<!--
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 
-->

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { darkTheme, GlobalThemeOverrides, NConfigProvider, NGlobalStyle, NMessageProvider, NDialogProvider } from 'naive-ui'
import Sidebar from './components/Sidebar.vue'
import { DEFAULT_ANIMATION } from '@renderer/config/animations'

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
  Message: {
    color: 'rgba(28, 28, 30, 0.95)',
    borderRadius: '12px',
    padding: '12px 20px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
    maxWidth: '380px'
  }
}

const currentTransition = ref(DEFAULT_ANIMATION)
const limitOpacity = ref(0) // 0.0 ~ 1.0 (纯线性透明度)

// 逻辑常量：Buffer = 20px
const LIMIT_W = 800
const LIMIT_H = 600
const BUFFER = 20

const updateTransition = () => {
  const saved = localStorage.getItem('ui-transition')
  currentTransition.value = saved || DEFAULT_ANIMATION
}

const handleResize = () => {
  const w = window.innerWidth
  const h = window.innerHeight
  
  // 1. 计算宽度挤压分 (0.0 ~ 1.0)
  // 当 w = 900 时 score = 0; 当 w = 880 时 score = 1
  let wScore = 0
  if (w < LIMIT_W) {
    wScore = (LIMIT_W - w) / BUFFER
    // 限制范围在 0~1 之间，防止溢出
    wScore = Math.min(Math.max(wScore, 0), 1)
  }

  // 2. 计算高度挤压分 (0.0 ~ 1.0)
  let hScore = 0
  if (h < LIMIT_H) {
    hScore = (LIMIT_H - h) / BUFFER
    hScore = Math.min(Math.max(hScore, 0), 1)
  }

  // 3. 线性混合：各占 50% 权重
  // 如果单边到底 -> 0.5
  // 如果双边到底 -> 1.0
  limitOpacity.value = (wScore * 0.5) + (hScore * 0.5)
}

onMounted(() => {
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
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        
        <div 
          class="minimal-glow" 
          :style="{ opacity: limitOpacity }"
        ></div>

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

      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
body { margin: 0; background-color: #000; overflow: hidden; user-select: none; }

/* 极简红光：无噪点，无动画，纯粹的内阴影 */
.minimal-glow {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 9999;
  /* 柔和的红色内发光 */
  box-shadow: inset 0 0 60px rgba(255, 59, 48, 0.8);
  /* 无 transition：实现零延迟物理跟随 */
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(145deg, #101014 0%, #000000 100%);
  color: white;
}

.sidebar-area { display: flex; flex-shrink: 0; }
.main-content { flex: 1; position: relative; overflow-y: auto; overflow-x: hidden; }

/* 页面切换动画 */
.fade-slide-enter-active { transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 1, 1); }
.fade-slide-enter-from { opacity: 0; transform: scale(1.02) translateY(10px); filter: blur(4px); }
.fade-slide-leave-to { opacity: 0; transform: scale(0.98); filter: blur(2px); }

.simple-fade-enter-active, .simple-fade-leave-active { transition: opacity 0.25s ease; }
.simple-fade-enter-from, .simple-fade-leave-to { opacity: 0; }
.none-enter-active, .none-leave-active { transition: none !important; }

::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
</style>