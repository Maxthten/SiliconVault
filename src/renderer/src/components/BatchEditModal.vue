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
import { ref, computed, watch } from 'vue'
import { 
  NModal, NInput, NButton, NIcon, NScrollbar, NInputNumber, 
  NTag, useMessage, useDialog, NSelect 
} from 'naive-ui'
import { 
  Search, Add, ArrowForward, TrashOutline, 
  CubeOutline, FlashOutline
} from '@vicons/ionicons5'
import EditDialog from './EditDialog.vue' 
import { useI18n } from '../utils/i18n' 

const { t } = useI18n()

// 映射表：用于在视觉上合并新旧数据
const LEGACY_MAP: Record<string, string> = {
  '电阻': 'Resistor',
  '电容': 'Capacitor',
  '电感': 'Inductor',
  '二极管': 'Diode',
  '三极管': 'Transistor',
  '芯片(IC)': 'IC',
  '连接器': 'Connector',
  '模块': 'Module',
  '开关/按键': 'Switch',
  '其他': 'Other',
  '未分类': 'Uncategorized'
}

interface InventoryItem {
  id: number
  name: string
  value: string
  package: string
  category: string
  quantity: number
  location?: string
}

interface SelectedItem extends InventoryItem {
  mode: 'add' | 'sub'
  delta: number
}

interface Props {
  show: boolean
  allInventory: InventoryItem[]
}

const props = defineProps<Props>()
const emit = defineEmits(['update:show', 'refresh'])

const message = useMessage()
const dialog = useDialog()
const isLoading = ref(false)

// 状态
const searchQuery = ref('')
const filterCategory = ref<string | null>(null)
const selectedList = ref<SelectedItem[]>([])

// 新建弹窗控制
const showCreateModal = ref(false)
const previousIds = ref<Set<number>>(new Set())

const filteredSourceList = computed(() => {
  const list = props.allInventory || [] 
  const selectedIds = new Set(selectedList.value.map(i => i.id))
  
  // 1. 过滤逻辑
  const result = list.filter(item => {
    if (selectedIds.has(item.id)) return false
    
    const keyword = searchQuery.value.toLowerCase().trim()
    const matchSearch = !keyword || 
      (item.name || '').toLowerCase().includes(keyword) || 
      (item.value || '').toLowerCase().includes(keyword) ||
      (item.package || '').toLowerCase().includes(keyword)
      
    const matchCat = !filterCategory.value || item.category === filterCategory.value
    
    return matchSearch && matchCat
  })

  return result.slice(0, 100)
})

// 改造后的分类选项：实现中英文视觉合并
const categoryOptions = computed<any[]>(() => {
  const list = props.allInventory || []
  // 获取当前列表中实际存在的所有分类
  const rawCats = new Set(list.map(i => i.category).filter(c => c))
  
  const mergedMap = new Map<string, { label: string, value: string }>()

  rawCats.forEach((rawCat) => {
    const canonicalKey = LEGACY_MAP[rawCat] || rawCat
    const transKey = `categories.${canonicalKey}`
    const translated = t(transKey)
    const displayLabel = translated !== transKey ? translated : rawCat

    if (mergedMap.has(displayLabel)) {
      // 如果当前是旧数据格式，优先保留旧数据值，防止筛选失效
      if (LEGACY_MAP[rawCat]) {
        mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
      }
    } else {
      mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
    }
  })

  const mergedOptions = Array.from(mergedMap.values())
  mergedOptions.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))

  return [{ label: t('inventory.allCategories'), value: null }, ...mergedOptions]
})

// 动作
const addToSelected = (item: InventoryItem) => {
  selectedList.value.push({ ...item, mode: 'add', delta: 1 })
}
const removeFromSelected = (index: number) => {
  selectedList.value.splice(index, 1)
}
const toggleMode = (item: SelectedItem) => {
  item.mode = item.mode === 'add' ? 'sub' : 'add'
}

// 新建相关
const openCreateModal = () => {
  previousIds.value = new Set((props.allInventory || []).map(i => i.id))
  showCreateModal.value = true
}
const onCreateSuccess = () => {
  emit('refresh')
}

// 自动添加新建项
watch(() => props.allInventory, (newVal) => {
  if (!showCreateModal.value || !newVal) return
  const newItem = newVal.find(item => !previousIds.value.has(item.id))
  if (newItem) {
    addToSelected(newItem)
    message.success(t('batchEdit.messages.autoAdded', { name: newItem.name }))
    previousIds.value = new Set((props.allInventory || []).map(i => i.id))
  }
}, { deep: true })

const executeBatchUpdate = async () => {
  isLoading.value = true
  try {
    const tasks = selectedList.value.map(item => {
      let newQty = item.quantity
      if (item.mode === 'add') {
        newQty += item.delta
      } else {
        newQty -= item.delta 
      }
      return window.api.updateQty(item.id, newQty)
    })
    
    await Promise.all(tasks)
    message.success(t('batchEdit.messages.updateSuccess', { count: tasks.length }))
    emit('refresh')
    emit('update:show', false)
    selectedList.value = []
  } catch (e) {
    console.error(e)
    message.error(t('batchEdit.messages.updateFailed'))
  } finally {
    isLoading.value = false
  }
}

const handleCheckAndExecute = () => {
  if (selectedList.value.length === 0) return

  const riskyItems = selectedList.value.filter(item => {
    if (item.mode === 'add') return false 
    const predictedQty = item.quantity - item.delta
    return predictedQty < 0
  })

  if (riskyItems.length > 0) {
    dialog.warning({
      title: t('batchEdit.warning.title'),
      content: t('batchEdit.warning.content', { count: riskyItems.length }) + '\n\n' + 
               riskyItems.slice(0, 3).map(i => `• ${i.value || i.name}`).join('\n') + 
               (riskyItems.length > 3 ? `\n...${t('batchEdit.warning.more', { count: riskyItems.length })}` : '') + 
               `\n\n${t('batchEdit.warning.confirm')}`,
      positiveText: t('batchEdit.warning.positive'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => {
        executeBatchUpdate()
      }
    })
  } else {
    executeBatchUpdate()
  }
}

watch(() => props.show, (val) => {
  if (val) {
    selectedList.value = []
    searchQuery.value = ''
  }
})
</script>

<template>
  <n-modal 
    :show="show" 
    @update:show="(v) => emit('update:show', v)"
    :bordered="false"
  >
    <div class="batch-runner-modal">
      <div class="modal-body">
        
        <div class="panel source-panel">
          <div class="panel-header">
            <div class="header-title">
              <n-icon :component="CubeOutline" /> {{ t('batchEdit.sourceList') }}
            </div>
            <n-button size="small" type="primary" dashed @click="openCreateModal">
              <template #icon><n-icon :component="Add" /></template>
              {{ t('common.add') }}
            </n-button>
          </div>

          <div class="search-bar">
            <n-input v-model:value="searchQuery" :placeholder="t('batchEdit.searchPlaceholder')" size="small" clearable>
              <template #prefix><n-icon :component="Search" /></template>
            </n-input>
            
            <div :title="filterCategory || t('inventory.category')" class="cat-select-wrapper">
              <n-select 
                v-model:value="filterCategory" 
                :options="categoryOptions" 
                size="small" 
                :placeholder="t('inventory.category')" 
                class="cat-select" 
              />
            </div>
          </div>

          <div class="list-wrapper">
            <n-scrollbar>
              <div v-if="filteredSourceList.length === 0" class="empty-tip">{{ t('batchEdit.notFound') }}</div>
              <div v-for="item in filteredSourceList" :key="item.id" class="inventory-item" @click="addToSelected(item)">
                <div class="item-info">
                  <div class="item-main">
                    <span class="item-val">{{ item.value || item.name }}</span>
                    <n-tag v-if="item.package" size="small" :bordered="false" class="pkg-tag">{{ item.package }}</n-tag>
                  </div>
                  <div class="item-sub">{{ item.name }} · {{ t('batchEdit.stock') }}: {{ item.quantity }}</div>
                </div>
                <div class="item-add-icon"><n-icon :component="ArrowForward" /></div>
              </div>
            </n-scrollbar>
          </div>
        </div>

        <div class="panel target-panel">
          <div class="panel-header target-header">
            <div class="header-title">
              <n-icon :component="FlashOutline" /> {{ t('batchEdit.todoList') }} ({{ selectedList.length }})
            </div>
            <n-button text size="tiny" v-if="selectedList.length > 0" @click="selectedList = []">{{ t('batchEdit.clear') }}</n-button>
          </div>

          <div class="list-wrapper target-bg">
            <div v-if="selectedList.length === 0" class="empty-target">
              <div class="dashed-box">
                <n-icon size="40" :component="ArrowForward" class="empty-icon" />
                <p v-html="t('batchEdit.emptyHint')"></p>
              </div>
            </div>

            <n-scrollbar v-else>
              <div v-for="(item, index) in selectedList" :key="item.id" class="selected-card" :class="item.mode">
                <div class="card-left">
                  <div class="card-val">{{ item.value || item.name }}</div>
                  <div class="card-sub">{{ item.package }} | {{ t('batchEdit.current') }}: {{ item.quantity }}</div>
                </div>
                <div class="card-ctrl">
                  <div class="mode-switch" @click="toggleMode(item)" :class="item.mode">
                    <div class="switch-bg"></div>
                    <span class="switch-text">{{ item.mode === 'add' ? t('batchEdit.mode.add') : t('batchEdit.mode.sub') }}</span>
                  </div>
                  <n-input-number v-model:value="item.delta" size="small" :min="1" class="delta-input" :show-button="false">
                    <template #prefix>
                       <span :class="item.mode === 'add' ? 'green-t' : 'red-t'">{{ item.mode === 'add' ? '+' : '-' }}</span>
                    </template>
                  </n-input-number>
                  <n-button circle text size="small" type="error" @click="removeFromSelected(index)">
                    <template #icon><n-icon :component="TrashOutline" /></template>
                  </n-button>
                </div>
              </div>
            </n-scrollbar>
          </div>

          <div class="panel-footer">
            <n-button block type="primary" :disabled="selectedList.length === 0" :loading="isLoading" @click="handleCheckAndExecute">
              {{ t('batchEdit.execute', { count: selectedList.length }) }}
            </n-button>
          </div>
        </div>

      </div>
    </div>
  </n-modal>

  <EditDialog v-model:show="showCreateModal" :edit-data="null" @refresh="onCreateSuccess" />
</template>

<style scoped>
/* 样式保持不变 */
.batch-runner-modal { 
  width: 950px; max-width: 95vw; height: 750px; max-height: 85vh;
  background: var(--bg-modal);
  border-radius: 16px; overflow: hidden;
  box-shadow: 0 0 0 1px var(--border-main), 0 20px 50px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
}

.modal-body {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden; 
}

.panel.source-panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-main); 
}

.panel.target-panel {
  flex: 1;
  background: var(--bg-modal);
  min-width: 0; 
}

.panel { display: flex; flex-direction: column; height: 100%; }

.panel-header {
  height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; 
  border-bottom: 1px solid var(--border-main);
}
.header-title { font-weight: 700; color: var(--text-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }

.search-bar { padding: 10px 12px; display: flex; gap: 8px; border-bottom: 1px solid var(--border-main); }

/* 修改：包裹层宽度 */
.cat-select-wrapper { width: 130px; flex-shrink: 0; }
.cat-select { width: 100%; }

.list-wrapper { 
  flex: 1; 
  overflow: hidden; 
  position: relative; 
  display: flex; 
  flex-direction: column;
}
.target-bg { background: transparent; }

.inventory-item {
  padding: 10px 16px; border-bottom: 1px solid var(--border-main); cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
}
.inventory-item:hover { background: var(--border-hover); }
.item-info { flex: 1; overflow: hidden; }
.item-main { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.item-val { font-weight: bold; color: var(--text-primary); font-size: 13px; }

.pkg-tag { 
  background: var(--border-main); 
  color: var(--text-secondary); 
  height: 16px; font-size: 10px; padding: 0 4px; 
}
.item-sub { font-size: 11px; color: var(--text-tertiary); }
.item-add-icon { color: var(--text-tertiary); transition: color 0.2s; }
.inventory-item:hover .item-add-icon { color: #0A84FF; }

.empty-target { 
  flex: 1; 
  width: 100%;
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.dashed-box {
  width: 200px; height: 150px; 
  border: 2px dashed var(--border-main); 
  border-radius: 12px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--text-tertiary); 
  gap: 10px; text-align: center; font-size: 13px;
}
.empty-icon { color: var(--text-tertiary); }

.selected-card {
  margin: 10px 16px; 
  background: var(--bg-card);
  border: 1px solid var(--border-main); 
  border-radius: 10px; padding: 10px 14px;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05); 
}
.selected-card.add { border-left: 3px solid #30D158; }
.selected-card.sub { border-left: 3px solid #FF453A; }

.card-left { flex: 1; }
.card-val { font-weight: bold; font-size: 14px; color: var(--text-primary); }
.card-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }

.card-ctrl { display: flex; align-items: center; gap: 12px; }

.mode-switch {
  cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;
  background: var(--border-main); 
  color: var(--text-secondary); 
  transition: all 0.2s;
}
.mode-switch.add { background: rgba(48, 209, 88, 0.15); color: #30D158; }
.mode-switch.sub { background: rgba(255, 69, 58, 0.15); color: #FF453A; }
.mode-switch:active { transform: scale(0.95); }

.delta-input { width: 80px; text-align: center; }
.green-t { color: #30D158; font-weight: bold; }
.red-t { color: #FF453A; font-weight: bold; }

.panel-footer { 
  flex-shrink: 0; 
  padding: 16px; 
  border-top: 1px solid var(--border-main); 
  background: var(--bg-modal);
}
.empty-tip { text-align: center; color: var(--text-tertiary); padding: 20px; font-size: 12px; }

@media (max-width: 768px) {
  .modal-body { flex-direction: column; }
  .source-panel { width: 100%; height: 50%; border-right: none; border-bottom: 1px solid var(--border-main); }
  .target-panel { width: 100%; height: 50%; }
}
</style>