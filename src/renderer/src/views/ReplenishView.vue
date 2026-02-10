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
import { ref, onMounted, computed, watch } from 'vue'
import { NSpin, NCollapse, NCollapseItem, NButton, NIcon, NPopover, NButtonGroup, NInputNumber, NInputGroup, useMessage } from 'naive-ui'
import { CheckmarkCircle, NotificationsOffOutline, NotificationsOutline, MoonOutline, TimeOutline } from '@vicons/ionicons5'
import InventoryCard from '../components/InventoryCard.vue'

const message = useMessage()
const loading = ref(false)
const rawList = ref<any[]>([])
const categoryRules = ref<Record<string, any>>({})

const isSnoozed = ref(false) 
const snoozeInfo = ref('') 
const islandAnimating = ref(false)

const showSnoozeMenu = ref(false)
const snoozeMode = ref<'menu' | 'custom'>('menu') 
const customDays = ref(3) 

const loadRules = async () => {
  try {
    const cats = await window.api.fetchCategories()
    const promises = cats.map(async (cat: string) => {
       const rule = await window.api.getCategoryRule(cat)
       return { cat, rule }
    })
    const results = await Promise.all(promises)
    const map: Record<string, any> = {}
    results.forEach(r => map[r.cat] = r.rule)
    categoryRules.value = map
  } catch (e) { console.error('加载规则失败', e) }
}

const loadData = async () => {
  loading.value = true
  await loadRules()
  await new Promise(r => setTimeout(r, 300))
  try {
    const grouped = await window.api.fetchInventory({})
    const flat = [] as any[]
    for (const cat in grouped) flat.push(...grouped[cat])
    rawList.value = flat
  } finally {
    loading.value = false
  }
}

const checkSnooze = () => {
  if (sessionStorage.getItem('replenish_snooze')) {
    isSnoozed.value = true
    snoozeInfo.value = '直到重启'
    return
  }
  const daySnooze = localStorage.getItem('replenish_snooze_until')
  if (daySnooze) {
    const expireTime = Number(daySnooze)
    if (expireTime > Date.now()) {
      isSnoozed.value = true
      const hoursLeft = Math.ceil((expireTime - Date.now()) / (1000 * 60 * 60))
      snoozeInfo.value = hoursLeft > 24 ? `${Math.ceil(hoursLeft / 24)} 天内` : `${hoursLeft} 小时内`
      return
    } else {
      localStorage.removeItem('replenish_snooze_until')
    }
  }
  isSnoozed.value = false
  snoozeInfo.value = ''
}

const handleSnooze = (type: 'session' | 'day') => {
  if (type === 'session') sessionStorage.setItem('replenish_snooze', 'true')
  else localStorage.setItem('replenish_snooze_until', String(Date.now() + 24 * 60 * 60 * 1000))
  finishSnooze()
}

const handleCustomSnooze = () => {
  if (!customDays.value || customDays.value <= 0) {
    message.warning('请输入有效的天数')
    return
  }
  localStorage.setItem('replenish_snooze_until', String(Date.now() + customDays.value * 24 * 60 * 60 * 1000))
  finishSnooze()
}

const finishSnooze = () => {
  checkSnooze()
  window.dispatchEvent(new Event('inventory-snooze-changed'))
  showSnoozeMenu.value = false 
  snoozeMode.value = 'menu'   
}

const handleResume = () => {
  sessionStorage.removeItem('replenish_snooze')
  localStorage.removeItem('replenish_snooze_until')
  checkSnooze()
  window.dispatchEvent(new Event('inventory-snooze-changed'))
}

type GroupedData = Record<string, any[]>
const redGroups = computed<GroupedData>(() => {
  const groups: GroupedData = {}
  rawList.value.forEach(item => {
    if (item.quantity <= 0) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
  })
  return groups
})

const yellowGroups = computed<GroupedData>(() => {
  const groups: GroupedData = {}
  rawList.value.forEach(item => {
    const min = item.min_stock ?? 10
    if (item.quantity > 0 && item.quantity <= min) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
  })
  return groups
})

const redCount = computed(() => Object.values(redGroups.value).flat().length)
const yellowCount = computed(() => Object.values(yellowGroups.value).flat().length)
const hasIssues = computed(() => redCount.value > 0 || yellowCount.value > 0)

const statusText = computed(() => {
  if (isSnoozed.value) return `报警已暂停 (${snoozeInfo.value})`
  if (!hasIssues.value) return '库存监控正常'
  const parts: string[] = []
  if (redCount.value > 0) parts.push(`${redCount.value} 项严重缺货`)
  if (yellowCount.value > 0) parts.push(`${yellowCount.value} 项预警`)
  return `发现 ${parts.join('，')}`
})

watch(showSnoozeMenu, (val) => {
  if (!val) setTimeout(() => { snoozeMode.value = 'menu' }, 200)
})

watch(isSnoozed, () => {
  islandAnimating.value = true
  setTimeout(() => { islandAnimating.value = false }, 600)
})

onMounted(() => {
  loadData()
  checkSnooze()
})
</script>

<template>
  <div class="replenish-page">
    
    <div class="island-container">
      <div 
        class="status-island" 
        :class="{ 
          'island-red': !isSnoozed && redCount > 0, 
          'island-yellow': !isSnoozed && redCount === 0 && yellowCount > 0,
          'island-green': !isSnoozed && !hasIssues,
          'island-sleep': isSnoozed,
          'jelly-bounce': islandAnimating
        }"
      >
        <div class="island-info">
          <Transition name="scale" mode="out-in">
            <n-icon size="20" :key="isSnoozed ? 'moon' : (hasIssues ? 'alert' : 'check')" :component="isSnoozed ? MoonOutline : (hasIssues ? NotificationsOutline : CheckmarkCircle)" />
          </Transition>
          <span class="island-text">{{ statusText }}</span>
        </div>

        <div class="island-actions" v-if="!isSnoozed && hasIssues">
          <n-popover 
            trigger="click" 
            placement="bottom-end" 
            :show-arrow="false"
            v-model:show="showSnoozeMenu"
          >
            <template #trigger>
              <n-button size="tiny" round class="snooze-btn">
                <template #icon><n-icon :component="NotificationsOffOutline" /></template>
                不再提醒
              </n-button>
            </template>
            <div class="snooze-container">
              <div v-if="snoozeMode === 'menu'" class="snooze-menu">
                <div class="menu-title">暂停报警...</div>
                <n-button-group vertical>
                  <n-button @click="handleSnooze('session')">直到软件重启</n-button>
                  <n-button @click="handleSnooze('day')">24 小时内</n-button>
                  <n-button @click="snoozeMode = 'custom'">
                    <template #icon><n-icon :component="TimeOutline" /></template>
                    自定义天数...
                  </n-button>
                </n-button-group>
              </div>
              <div v-else class="snooze-custom">
                <div class="menu-title">输入暂停天数</div>
                <n-input-group>
                  <n-input-number v-model:value="customDays" :min="1" :max="365" style="width: 100px" />
                  <n-button ghost @click="handleCustomSnooze">确认</n-button>
                </n-input-group>
                <n-button size="tiny" text class="back-btn" @click="snoozeMode = 'menu'"> &lt; 返回 </n-button>
              </div>
            </div>
          </n-popover>
        </div>
      </div>
    </div>

    <div class="content">
      <n-spin :show="loading">
        <Transition name="fade-up" mode="out-in">
          
          <div v-if="isSnoozed" class="sleep-state state-container" key="sleep">
            <n-icon size="80" :component="MoonOutline" class="state-icon" />
            <p>监控系统正在休息中 ({{ snoozeInfo }})</p>
            <n-button secondary size="large" @click="handleResume" class="wake-btn">叫醒它</n-button>
          </div>

          <div v-else-if="!hasIssues && !loading" class="empty-state state-container" key="empty">
            <n-icon size="60" :component="CheckmarkCircle" color="#63e2b7" />
            <p>库存非常健康，无需补货</p>
            <n-button secondary size="small" @click="loadData">刷新</n-button>
          </div>

          <div v-else class="monitor-layout state-container" key="list">
            
            <div v-if="Object.keys(redGroups).length > 0" class="danger-zone section">
              <div class="zone-header red-header"><span>🔥 严重耗尽 (立即采购)</span></div>
              <n-collapse :default-expanded-names="Object.keys(redGroups)">
                <n-collapse-item v-for="(items, cat) in redGroups" :key="cat" :title="cat + ` (${items.length})`" :name="cat">
                  <div class="grid">
                    <InventoryCard 
                      v-for="item in items" 
                      :key="item.id" 
                      :item="item" 
                      :is-edit-mode="false" 
                      read-only 
                      :display-rule="categoryRules[item.category]"
                    />
                  </div>
                </n-collapse-item>
              </n-collapse>
            </div>

            <div v-if="Object.keys(yellowGroups).length > 0" class="warning-zone section">
              <div class="zone-header yellow-header"><span>⚠️ 低库存预警 (建议补充)</span></div>
              <n-collapse :default-expanded-names="Object.keys(yellowGroups)">
                <n-collapse-item v-for="(items, cat) in yellowGroups" :key="cat" :title="cat + ` (${items.length})`" :name="cat">
                  <div class="grid">
                    <InventoryCard 
                      v-for="item in items" 
                      :key="item.id" 
                      :item="item" 
                      :is-edit-mode="false" 
                      read-only 
                      :display-rule="categoryRules[item.category]"
                    />
                  </div>
                </n-collapse-item>
              </n-collapse>
            </div>

          </div>
          
        </Transition>
      </n-spin>
    </div>
  </div>
</template>

<style scoped>
.replenish-page { padding: 30px; height: 100%; display: flex; flex-direction: column; position: relative; }
@media (max-width: 768px) { .replenish-page { padding: 16px; } }
.island-container { display: flex; justify-content: center; margin-bottom: 24px; }


.status-island {
  display: flex; align-items: center; 
  justify-content: center; 
  gap: 20px;
  padding: 8px 16px; border-radius: 24px;
  
  /* 基础背景变量 */
  background: var(--bg-card); 
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  
  width: fit-content; max-width: 90%;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  color: var(--text-primary);
}

@keyframes jelly-bounce {
  0%   { transform: scale(1, 1); }
  30%  { transform: scale(0.95, 1.05); } 
  50%  { transform: scale(1.05, 0.95); } 
  70%  { transform: scale(0.98, 1.02); } 
  100% { transform: scale(1, 1); }       
}
.jelly-bounce { animation: jelly-bounce 0.6s; }

.island-info { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; white-space: nowrap; }
.snooze-btn { display: flex; align-items: center; }

/* 核心变量接入：实心化颜色 */
.island-red { 
  background: var(--rep-bg-red);
  border: var(--rep-border-red);
  color: var(--rep-text-red);
}

.island-yellow { 
  background: var(--rep-bg-yellow);
  border: var(--rep-border-yellow);
  color: var(--rep-text-yellow);
}

.island-green { 
  background: rgba(99, 226, 183, 0.1); 
  border-color: rgba(99, 226, 183, 0.3); 
  color: #63e2b7; 
}
:global([data-theme="light"]) .island-green { color: #10a37f; }

.island-sleep { 
  background: var(--rep-bg-sleep);
  color: var(--text-tertiary);
  border-color: transparent; 
  padding: 8px 24px; 
}

.snooze-container { width: 160px; }
.snooze-menu, .snooze-custom { padding: 8px 4px; display: flex; flex-direction: column; gap: 8px; }
.menu-title { font-size: 12px; color: var(--text-tertiary); margin-bottom: 2px; padding-left: 4px; }
.back-btn { align-self: flex-start; margin-top: 4px; font-size: 12px; color: var(--text-tertiary); }

.content { flex: 1; overflow-y: auto; padding-bottom: 40px; position: relative; }
.state-container { width: 100%; height: 100%; display: flex; flex-direction: column; }

.empty-state, .sleep-state { 
  align-items: center; justify-content: center; height: 60vh; 
  color: var(--text-tertiary); gap: 20px; 
}
.state-icon { color: var(--text-tertiary); }
.wake-btn { padding: 0 30px; font-weight: bold; }

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.fade-up-enter-from { opacity: 0; transform: translateY(20px); }
.fade-up-leave-to { opacity: 0; transform: translateY(-20px) scale(0.98); }
.scale-enter-active, .scale-leave-active { transition: all 0.2s; }
.scale-enter-from, .scale-leave-to { transform: scale(0); opacity: 0; }

.section { margin-bottom: 30px; }
.zone-header { padding: 10px 16px; border-radius: 8px; font-weight: bold; margin-bottom: 12px; display: inline-block; }

/* 区域标题颜色接入变量 */
.red-header { 
  background: var(--rep-bg-red);
  border: var(--rep-border-red);
  color: var(--rep-text-red);
}

.yellow-header { 
  background: var(--rep-bg-yellow);
  border: var(--rep-border-yellow);
  color: var(--rep-text-yellow);
}

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 8px 0; }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }


:deep(.n-collapse-item) {
  border-bottom: var(--rep-divider);
  margin-bottom: 8px;
  padding-bottom: 8px;
}
:deep(.n-collapse-item:last-child) { border-bottom: none; }
:deep(.n-collapse-item__header-main) { color: var(--text-primary) !important; font-weight: 600; }
</style>