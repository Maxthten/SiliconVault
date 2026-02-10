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
import { NIcon } from 'naive-ui'
import { 
  RemoveOutline, 
  SquareOutline, 
  CloseOutline 
} from '@vicons/ionicons5'
import { geekQuotes } from '../data/quotes'

// 平台检测
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

// 语录与动画状态
const displayText = ref('')
const currentIndex = ref(Math.floor(Math.random() * geekQuotes.length))
const isTyping = ref(false)

let typeTimer: NodeJS.Timeout | null = null
let autoSwitchTimer: NodeJS.Timeout | null = null

// 窗口控制
const handleMinimize = () => window.api.windowControl('minimize')
const handleMaximize = () => window.api.windowControl('maximize')
const handleClose = () => window.api.windowControl('close')

// 启动打字机动画
const startTypewriter = () => {
  if (typeTimer) clearTimeout(typeTimer)
  if (autoSwitchTimer) clearTimeout(autoSwitchTimer)

  displayText.value = ''
  isTyping.value = true

  const fullText = geekQuotes[currentIndex.value]
  let charIndex = 0

  const typeChar = () => {
    if (charIndex < fullText.length) {
      displayText.value += fullText.charAt(charIndex)
      charIndex++
      // 模拟打字速度 (30ms - 80ms)
      typeTimer = setTimeout(typeChar, Math.floor(Math.random() * 50) + 30)
    } else {
      isTyping.value = false
      // 开启自动轮播倒计时 (10秒)
      autoSwitchTimer = setTimeout(() => {
        switchQuote()
      }, 10000)
    }
  }

  typeChar()
}

// 切换下一句
const switchQuote = () => {
  let nextIndex = currentIndex.value + 1
  if (nextIndex >= geekQuotes.length) nextIndex = 0
  
  currentIndex.value = nextIndex
  startTypewriter()
}

// 点击交互
const handleClick = () => {
  if (isTyping.value) return
  switchQuote()
}

onMounted(() => {
  startTypewriter()
})

onUnmounted(() => {
  if (typeTimer) clearTimeout(typeTimer)
  if (autoSwitchTimer) clearTimeout(autoSwitchTimer)
})
</script>

<template>
  <div class="title-bar" :class="{ 'is-mac': isMac }">
    
    <div class="left-area">
      <img src="@renderer/assets/logo.png" class="app-logo" alt="logo" />
      <span class="app-name">SiliconVault</span>
    </div>

    <div 
      class="middle-area" 
      @click="handleClick"
      title="点击切换下一条"
    >
      <span class="geek-text">{{ displayText }}</span>
      <span class="cursor" :class="{ 'typing': isTyping }">_</span>
    </div>

    <div v-if="!isMac" class="window-controls">
      <div class="control-box" @click="handleMinimize">
        <div class="icon-wrapper">
          <n-icon size="16" :component="RemoveOutline" />
        </div>
      </div>
      <div class="control-box" @click="handleMaximize">
        <div class="icon-wrapper">
          <n-icon size="14" :component="SquareOutline" />
        </div>
      </div>
      <div class="control-box close-btn" @click="handleClose">
        <div class="icon-wrapper">
          <n-icon size="18" :component="CloseOutline" />
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.title-bar {
  height: 38px;
  background: var(--bg-sidebar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  border-bottom: 1px solid var(--border-main);
  box-sizing: border-box;
  color: var(--text-primary);
  -webkit-app-region: drag;
  padding: 0 6px;
  position: relative;
  z-index: 9999;
}

.is-mac {
  padding-left: 80px;
}

.left-area {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 8px;
  flex-shrink: 0;
}

.app-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--text-primary);
}

/* --- 中间语录区 --- */
.middle-area {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer; 
  padding: 0 20px; 
  -webkit-app-region: drag;
}

.middle-area:hover .geek-text {
  color: var(--text-secondary);
}

.geek-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s ease;
}

/* 光标闪烁 */
.cursor {
  display: inline-block;
  margin-left: 2px;
  font-weight: bold;
  opacity: 1;
  animation: blink 1s step-end infinite;
}

.cursor.typing {
  animation: none;
  opacity: 1;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* --- 右侧按钮 --- */
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 4px;
  -webkit-app-region: no-drag;
  padding-right: 4px;
  flex-shrink: 0;
}

.control-box {
  width: 34px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.control-box:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.control-box:hover .icon-wrapper {
  transform: scale(1.15);
}

:global([data-theme="light"]) .control-box:hover {
  background: rgba(0, 0, 0, 0.06);
}

.close-btn:hover {
  background: #E81123 !important;
  color: white !important;
}

.close-btn:hover .icon-wrapper {
  transform: rotate(90deg) scale(1.1);
}

.close-btn:active {
  background: #bf0f1d !important;
  transform: scale(0.95);
}
</style>