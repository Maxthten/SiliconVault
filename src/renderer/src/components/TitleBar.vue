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
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon } from 'naive-ui'
import { 
  RemoveOutline, 
  SquareOutline, 
  CloseOutline 
} from '@vicons/ionicons5'
import {
  getQuoteCollection,
  isQuoteLanguageMode,
  QUOTE_LANGUAGE_CHANGED_EVENT,
  QUOTE_LANGUAGE_STORAGE_KEY,
  type QuoteLanguageMode
} from '../data/quotes'

const { locale } = useI18n()

// 平台检测
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

// 语录与动画状态
const displayText = ref('')
const quoteLanguageMode = ref<QuoteLanguageMode>('auto')
const quotes = computed(() => getQuoteCollection(quoteLanguageMode.value, locale.value))
const quoteActionTitle = computed(() =>
  locale.value.toLowerCase().startsWith('zh') ? '点击切换下一条' : 'Click for the next quote'
)
const currentIndex = ref(Math.floor(Math.random() * quotes.value.length))
const isTyping = ref(false)
const isDevelopment = ref(false)

let typeTimer: ReturnType<typeof setTimeout> | null = null
let autoSwitchTimer: ReturnType<typeof setTimeout> | null = null

const loadQuoteLanguageMode = (): QuoteLanguageMode => {
  const savedMode = localStorage.getItem(QUOTE_LANGUAGE_STORAGE_KEY)
  return isQuoteLanguageMode(savedMode) ? savedMode : 'auto'
}

const handleQuoteLanguageChange = (): void => {
  quoteLanguageMode.value = loadQuoteLanguageMode()
}

// 窗口控制
const handleMinimize = (): Promise<void> => window.api.windowControl('minimize')
const handleMaximize = (): Promise<void> => window.api.windowControl('maximize')
const handleClose = (): Promise<void> => window.api.windowControl('close')

// 启动打字机动画
const startTypewriter = (): void => {
  if (typeTimer) clearTimeout(typeTimer)
  if (autoSwitchTimer) clearTimeout(autoSwitchTimer)

  displayText.value = ''
  isTyping.value = true

  const fullText = quotes.value[currentIndex.value] || ''
  let charIndex = 0

  const typeChar = (): void => {
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
const switchQuote = (): void => {
  let nextIndex = currentIndex.value + 1
  if (nextIndex >= quotes.value.length) nextIndex = 0
  
  currentIndex.value = nextIndex
  startTypewriter()
}

// 点击交互
const handleClick = (): void => {
  if (isTyping.value) return
  switchQuote()
}

watch(quotes, (nextQuotes) => {
  currentIndex.value = nextQuotes.length > 0 ? currentIndex.value % nextQuotes.length : 0
  startTypewriter()
})

onMounted(() => {
  quoteLanguageMode.value = loadQuoteLanguageMode()
  window.addEventListener(QUOTE_LANGUAGE_CHANGED_EVENT, handleQuoteLanguageChange)
  startTypewriter()
  window.api.getRuntimeEnvironment()
    .then((environment) => {
      isDevelopment.value = environment.isDevelopment
    })
    .catch((error) => {
      console.error('Failed to load runtime environment:', error)
    })
})

onUnmounted(() => {
  if (typeTimer) clearTimeout(typeTimer)
  if (autoSwitchTimer) clearTimeout(autoSwitchTimer)
  window.removeEventListener(QUOTE_LANGUAGE_CHANGED_EVENT, handleQuoteLanguageChange)
})
</script>

<template>
  <div class="title-bar" :class="{ 'is-mac': isMac }">
    
    <div class="left-area">
      <img src="@renderer/assets/logo.png" class="app-logo" alt="logo" />
      <span class="app-name">SiliconVault</span>
      <span v-if="isDevelopment" class="dev-badge">DEV</span>
    </div>

    <div class="middle-area">
      <div
        class="quote-action"
        role="button"
        tabindex="0"
        :title="quoteActionTitle"
        :aria-label="quoteActionTitle"
        @click="handleClick"
        @keydown.enter.prevent="handleClick"
        @keydown.space.prevent="handleClick"
      >
        <span class="geek-text">{{ displayText }}</span>
        <span class="cursor" :class="{ 'typing': isTyping }">_</span>
      </div>
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

.dev-badge {
  padding: 2px 7px;
  border: 1px solid rgba(255, 159, 10, 0.42);
  border-radius: 999px;
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
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
  padding: 0 20px; 
  -webkit-app-region: drag;
}

.quote-action {
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  padding: 3px 8px;
  outline: none;
  -webkit-app-region: no-drag;
}

.quote-action:hover .geek-text,
.quote-action:focus-visible .geek-text {
  color: var(--text-secondary);
}

.quote-action:focus-visible {
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.35);
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
