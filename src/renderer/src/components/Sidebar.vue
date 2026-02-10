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
import { useRouter, useRoute } from 'vue-router'
import { 
  CubeOutline, 
  RocketOutline, 
  WarningOutline, 
  TimeOutline, 
  ServerOutline, 
  SettingsOutline,
  StatsChartOutline 
} from '@vicons/ionicons5'
import { NIcon, NTooltip } from 'naive-ui'
import ThemeToggle from './ThemeToggle.vue' // 引入天空之窗组件

const router = useRouter()
const route = useRoute()

// 0: 正常, 1: 黄色预警, 2: 红色报警
const warningLevel = ref(0)
let timer: NodeJS.Timeout | null = null

// 库存健康度检测逻辑
const checkHealth = async () => {
  const isSessionSnoozed = !!sessionStorage.getItem('replenish_snooze')
  const daySnooze = localStorage.getItem('replenish_snooze_until')
  const isDaySnoozed = daySnooze && Number(daySnooze) > Date.now()

  if (isSessionSnoozed || isDaySnoozed) {
    warningLevel.value = 0
    return
  }

  try {
    const grouped = await window.api.fetchInventory({})
    let red = 0
    let yellow = 0
    
    for (const cat in grouped) {
      for (const item of grouped[cat]) {
        const min = item.min_stock ?? 10
        if (item.quantity <= 0) red++
        else if (item.quantity <= min) yellow++
      }
    }

    if (red > 0) warningLevel.value = 2
    else if (yellow > 0) warningLevel.value = 1
    else warningLevel.value = 0

  } catch (e) {
    console.error("库存检测失败:", e)
  }
}

const navigateTo = (path: string) => {
  router.push(path)
  checkHealth()
}

onMounted(() => {
  checkHealth()
  timer = setInterval(checkHealth, 10000) 
  window.addEventListener('inventory-snooze-changed', checkHealth)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('inventory-snooze-changed', checkHealth)
})
</script>

<template>
  <div class="sidebar">
    <div class="logo-area">
      <div class="logo-box">📦</div>
    </div>
    
    <div class="nav-group">
      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/' }" @click="navigateTo('/')">
            <n-icon size="24" :component="CubeOutline" />
          </div>
        </template>
        库存管理
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/bom' }" @click="navigateTo('/bom')">
            <n-icon size="24" :component="RocketOutline" />
          </div>
        </template>
        项目 BOM
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div 
            class="nav-item warning-item" 
            :class="{ 
              active: route.path === '/replenish', 
              'is-yellow': warningLevel === 1,
              'is-red': warningLevel === 2
            }" 
            @click="navigateTo('/replenish')"
          >
            <div class="icon-wrapper" :class="{ 'shake-anim': warningLevel === 2 }">
              <n-icon size="24" :component="WarningOutline" />
            </div>
            <div v-if="warningLevel > 0" class="dot"></div>
          </div>
        </template>
        <span>补货中心 {{ warningLevel === 2 ? '(急需!)' : '' }}</span>
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/consumption' }" @click="navigateTo('/consumption')">
            <n-icon size="24" :component="StatsChartOutline" />
          </div>
        </template>
        消耗看板
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/data' }" @click="navigateTo('/data')">
            <n-icon size="24" :component="ServerOutline" />
          </div>
        </template>
        数据中心
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/logs' }" @click="navigateTo('/logs')">
            <n-icon size="24" :component="TimeOutline" />
          </div>
        </template>
        操作历史
      </n-tooltip>
    </div>

    <div class="bottom-group">
      <ThemeToggle />

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/settings' }" @click="navigateTo('/settings')">
            <n-icon size="24" :component="SettingsOutline" />
          </div>
        </template>
        系统设置
      </n-tooltip>
    </div>

  </div>
</template>

<style scoped>
.sidebar { 
  width: 70px; 
  /* 必须是 100% 以适应父容器 */
  height: 100%;
  box-sizing: border-box;
  
  background-color: var(--bg-sidebar); 
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  
  border-right: 1px solid var(--border-main); 
  
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  padding: 20px 0 16px 0; 
  gap: 0; 
  z-index: 100;
  
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.logo-area {
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.logo-box {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--border-main);
}

.nav-group { 
  display: flex; 
  flex-direction: column; 
  gap: 18px; 
  width: 100%; 
  align-items: center; 
  flex: 1; 
  overflow-y: auto; 
  scrollbar-width: none; 
}
.nav-group::-webkit-scrollbar { display: none; }

.bottom-group {
  margin-top: auto; 
  flex-shrink: 0;
  width: 100%;
  
  /* 使用 Flex 布局确保垂直排列和居中 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px; /* 保持与上方导航一致的间距 */
}

.nav-item { 
  width: 44px; height: 44px; border-radius: 12px; 
  display: flex; justify-content: center; align-items: center; 
  color: var(--text-tertiary); 
  cursor: pointer; 
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); 
  position: relative; 
  flex-shrink: 0;
}

.nav-item:hover { 
  background-color: var(--border-hover); 
  color: var(--text-primary); 
  transform: scale(1.05);
}

.nav-item.active { 
  background-color: #0A84FF; 
  color: #fff; 
  box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
}

.icon-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }

.warning-item.is-yellow { color: #f2c97d; }
:global([data-theme="light"]) .warning-item.is-yellow { color: #dda845; }
.warning-item.is-yellow:hover { background: rgba(242, 201, 125, 0.15); }
.warning-item.is-yellow.active { background: #f2c97d; color: #000; box-shadow: 0 4px 12px rgba(242, 201, 125, 0.3); }

.warning-item.is-red { color: #ff5e57; }
.warning-item.is-red:hover { background: rgba(255, 94, 87, 0.15); }
.warning-item.is-red.active { background: #ff5e57; color: #fff; box-shadow: 0 4px 12px rgba(255, 94, 87, 0.4); }

.dot { 
  position: absolute; top: 10px; right: 10px; 
  width: 6px; height: 6px; 
  border-radius: 50%; 
  background-color: currentColor; 
  box-shadow: 0 0 4px currentColor;
}

@keyframes shake {
  0% { transform: rotate(0deg); } 5% { transform: rotate(-10deg); } 10% { transform: rotate(10deg); } 15% { transform: rotate(-10deg); } 20% { transform: rotate(0deg); } 100% { transform: rotate(0deg); }
}
.shake-anim { animation: shake 2.5s ease-in-out infinite; transform-origin: center center; }

</style>