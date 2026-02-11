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
  NModal, NCard, NButton, NIcon, NCheckbox, NScrollbar, 
  NAlert, useMessage, NInput, NDivider, NTag, NTabs, NTabPane
} from 'naive-ui'
import { 
  Close, Search, CubeOutline, LayersOutline, 
  DocumentTextOutline, ArchiveOutline
} from '@vicons/ionicons5'
import Papa from 'papaparse'
import { useI18n } from '../utils/i18n' 

const props = defineProps<{ 
  show: boolean
  mode?: 'inventory' | 'project' 
}>()

const emit = defineEmits(['update:show'])
const message = useMessage()
const { t } = useI18n()

// 映射表
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

const activeTab = ref<'inventory' | 'project'>('inventory')
const isProcessing = ref(false)
const listData = ref<any[]>([]) 
const searchQuery = ref('')
const selectedIds = ref<number[]>([])
const categoryRules = ref<Record<string, any>>({})

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
  } catch (e) { console.error(e) }
}

const getItemDisplay = (item: any) => {
  if (activeTab.value === 'project') {
    return {
      primary: item.name,
      side: '',
      secondary: item.description || t('common.noDescription')
    }
  }

  const rawCat = item.category
  const ruleKey = LEGACY_MAP[rawCat] || rawCat
  const rule = categoryRules.value[ruleKey]
  
  let targetKey = 'name'

  if (rule?.layout) {
    if (typeof rule.layout === 'object' && rule.layout.topLeft) {
      targetKey = rule.layout.topLeft
    } else if (Array.isArray(rule.layout) && rule.layout[0]) {
      targetKey = rule.layout[0]
    }
  }

  let primary = item[targetKey]
  if (!primary) primary = item.name || t('common.unnamed')

  let side = ''
  if (targetKey === 'value') {
    if (item.name && item.name !== primary) side = item.name
  } else {
    if (item.value) side = item.value
  }

  return {
    primary,
    side,
    secondary: t('exportWizard.item.stockInfo', { 
      package: item.package || '-', 
      quantity: item.quantity 
    })
  }
}

// 获取分类显示名称
const getCategoryDisplay = (rawCat: string) => {
  if (!rawCat) return ''
  const canonicalKey = LEGACY_MAP[rawCat] || rawCat
  const transKey = `categories.${canonicalKey}`
  const translated = t(transKey)
  return translated !== transKey ? translated : rawCat
}

const loadData = async () => {
  try {
    listData.value = []
    
    if (activeTab.value === 'project') {
      listData.value = await window.api.getProjects('')
    } else {
      const grouped = await window.api.fetchInventory({})
      const flat: any[] = []
      Object.values(grouped).forEach((group: any) => flat.push(...group))
      listData.value = flat
    }
  } catch (e) {
    console.error(e)
    message.error(t('messages.error.loadFailed'))
  }
}

watch(() => props.show, (val) => {
  if (val) {
    if (props.mode) activeTab.value = props.mode
    resetState()
    loadRules()
    loadData()
  }
})

watch(activeTab, () => {
  if (props.show) {
    resetState()
    loadData()
  }
})

const resetState = () => {
  searchQuery.value = ''
  selectedIds.value = [] 
}

const filteredList = computed(() => {
  if (!searchQuery.value) return listData.value
  const q = searchQuery.value.toLowerCase()
  
  return listData.value.filter(item => {
    const basicMatch = (item.name && item.name.toLowerCase().includes(q)) ||
      (item.value && item.value.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    
    if (basicMatch) return true

    if (item.category) {
      const raw = item.category.toLowerCase()
      if (raw.includes(q)) return true 

      const canonical = (LEGACY_MAP[item.category] || item.category).toLowerCase()
      if (canonical.includes(q)) return true 

      const display = getCategoryDisplay(item.category).toLowerCase()
      if (display.includes(q)) return true 
    }

    return false
  })
})

const isAllSelected = computed(() => {
  return filteredList.value.length > 0 && 
         filteredList.value.every(item => selectedIds.value.includes(item.id))
})

const toggleAll = () => {
  if (isAllSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = filteredList.value.map(item => item.id)
  }
}

const toggleItem = (id: number) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

const handleExportCSV = async () => {
  if (selectedIds.value.length === 0) return message.warning(t('messages.warning.selectAtLeastOne'))
  
  isProcessing.value = true
  try {
    const targets = listData.value.filter(i => selectedIds.value.includes(i.id))
    
    const cleanData = targets.map(item => {
      const { id, image_paths, datasheet_paths, files, ...rest } = item
      
      // 导出前转换分类为当前语言显示值
      return {
        ...rest,
        category: getCategoryDisplay(item.category) 
      }
    })

    const csv = Papa.unparse(cleanData)
    const prefix = activeTab.value === 'inventory' ? 'Inventory' : 'Projects'
    const typeLabel = activeTab.value === 'inventory' ? t('exportWizard.tabs.inventory') : t('exportWizard.tabs.project')
    
    await window.api.exportData({
      title: t('exportWizard.exportCsvTitle', { type: typeLabel }),
      filename: `${prefix}_Selection_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv
    })
    
    message.success(t('exportWizard.messages.csvSuccess'))
    emit('update:show', false)
    return true
  } catch (e) {
    message.error(t('dataCenter.messages.exportFailed'))
    return false
  } finally {
    isProcessing.value = false
  }
}

const handleExportBundle = async () => {
  if (selectedIds.value.length === 0) return message.warning(t('messages.warning.selectAtLeastOne'))

  isProcessing.value = true
  try {
    const rawIds = JSON.parse(JSON.stringify(selectedIds.value))

    // 类型断言规避多余属性检查
    const res = await (window.api.exportBundle as any)({
      title: t('exportWizard.buttons.exportBundle'), 
      type: 'custom',
      inventoryIds: activeTab.value === 'inventory' ? rawIds : undefined,
      projectIds: activeTab.value === 'project' ? rawIds : undefined
    })

    if (res && res.success) {
      const count = activeTab.value === 'project' ? res.count.projects : res.count.inventory
      message.success(t('exportWizard.messages.bundleSuccess', { count }))
      emit('update:show', false)
    }
  } catch (e) {
    console.error(e)
    message.error(t('exportWizard.messages.bundleFailed'))
  } finally {
    isProcessing.value = false
  }
  return
}
</script>

<template>
  <n-modal 
    :show="show" 
    @update:show="(v) => emit('update:show', v)"
    transform-origin="center"
  >
    <n-card class="wizard-modal" :bordered="false" role="dialog" aria-modal="true">
      
      <div class="modal-header">
        <div class="title">
          <n-icon size="22" :component="ArchiveOutline" class="header-icon" />
          <span>{{ t('dataCenter.export.title') }}</span>
        </div>
        <n-button text circle @click="emit('update:show', false)" class="close-btn">
          <template #icon><n-icon size="20" :component="Close" class="close-icon" /></template>
        </n-button>
      </div>

      <div class="modal-content">
        
        <n-tabs v-model:value="activeTab" type="segment" animated style="margin-bottom: 16px;">
          <n-tab-pane name="inventory" :tab="t('exportWizard.tabs.inventory')">
            <template #tab>
              <n-icon :component="CubeOutline" style="margin-right: 6px" /> {{ t('exportWizard.tabs.inventory') }}
            </template>
          </n-tab-pane>
          <n-tab-pane name="project" :tab="t('exportWizard.tabs.project')">
            <template #tab>
              <n-icon :component="LayersOutline" style="margin-right: 6px" /> {{ t('exportWizard.tabs.project') }}
            </template>
          </n-tab-pane>
        </n-tabs>

        <div class="toolbar-row">
          <div class="search-wrap">
            <n-input v-model:value="searchQuery" :placeholder="t('exportWizard.searchPlaceholder')" size="small" clearable>
              <template #prefix><n-icon :component="Search" /></template>
            </n-input>
          </div>
          <n-button size="small" secondary @click="toggleAll">
            {{ isAllSelected ? t('exportWizard.buttons.deselectAll') : t('exportWizard.buttons.selectAll') }}
          </n-button>
        </div>

        <div class="list-box">
          <n-scrollbar style="max-height: 300px">
            <div v-if="filteredList.length === 0" class="empty-hint">{{ t('exportWizard.noData') }}</div>
            
            <div 
              v-for="item in filteredList" 
              :key="item.id" 
              class="list-item"
              :class="{ selected: selectedIds.includes(item.id) }"
              @click="toggleItem(item.id)"
            >
              <n-checkbox 
                :checked="selectedIds.includes(item.id)" 
                @click.stop="toggleItem(item.id)"
                class="item-check"
              />
              <div class="item-info">
                <div class="main-text">
                  <n-tag v-if="item.category" size="small" :bordered="false" class="cat-tag" style="margin-right: 8px">
                    {{ getCategoryDisplay(item.category) }}
                  </n-tag>
                  {{ getItemDisplay(item).primary }} 
                  <span v-if="getItemDisplay(item).side" class="sub-val">[{{ getItemDisplay(item).side }}]</span>
                </div>
                <div class="sub-text">
                  {{ getItemDisplay(item).secondary }}
                </div>
              </div>
            </div>
          </n-scrollbar>
        </div>

        <div class="status-bar">
          <span>{{ t('exportWizard.status.selected', { count: selectedIds.length }) }}</span>
        </div>

        <n-divider style="margin: 16px 0" />

        <n-alert type="info" :show-icon="false" class="hint-box">
          <div v-if="activeTab === 'project'">
            {{ t('exportWizard.hints.project') }}
          </div>
          <div v-else>
            {{ t('exportWizard.hints.bundle') }}
          </div>
        </n-alert>

      </div>

      <div class="modal-footer">
        <n-button 
          secondary 
          :disabled="selectedIds.length === 0 || isProcessing"
          @click="handleExportCSV"
        >
          <template #icon><n-icon :component="DocumentTextOutline" /></template>
          {{ t('exportWizard.buttons.exportCsv') }}
        </n-button>

        <n-button 
          type="primary" 
          :disabled="selectedIds.length === 0"
          :loading="isProcessing"
          @click="handleExportBundle"
        >
          <template #icon><n-icon :component="ArchiveOutline" /></template>
          {{ t('exportWizard.buttons.exportBundle') }}
        </n-button>
      </div>

    </n-card>
  </n-modal>
</template>

<style scoped>
.wizard-modal {
  width: 640px;
  background-color: var(--bg-modal); 
  border-radius: 16px;
  overflow: hidden;
}

:deep(.n-card__content) { padding: 0 !important; }

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-main);
  display: flex; justify-content: space-between; align-items: center;
}
.title { font-size: 17px; font-weight: bold; display: flex; align-items: center; gap: 10px; color: var(--text-primary); }
.header-icon { color: var(--text-primary); }

.close-btn {
  width: 32px; 
  height: 32px;
  display: flex; 
  align-items: center; 
  justify-content: center;
  border-radius: 50%;
  padding: 0;
}
.close-btn:hover {
  background-color: var(--border-hover);
}
.close-icon { color: var(--text-tertiary); }

.modal-content { padding: 20px 24px; }

.toolbar-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.search-wrap { flex: 1; }

.list-box {
  background: var(--bg-sidebar); 
  border-radius: 8px; 
  border: 1px solid var(--border-main);
  height: 300px; overflow: hidden;
}
.empty-hint { text-align: center; color: var(--text-tertiary); margin-top: 40px; }

.list-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  border-bottom: 1px solid var(--border-main); 
  cursor: pointer; transition: background 0.2s;
}
.list-item:hover { background: var(--border-hover); }
.list-item.selected { background: rgba(10, 132, 255, 0.15); }

.item-info { flex: 1; overflow: hidden; }
.main-text { font-weight: bold; color: var(--text-primary); font-size: 14px; display: flex; align-items: center; }
.sub-val { color: var(--text-tertiary); font-weight: normal; margin-left: 4px; }
.sub-text { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

.cat-tag {
  background: var(--border-main);
  color: var(--text-secondary);
}

.status-bar { text-align: right; font-size: 12px; color: var(--text-secondary); margin-top: 8px; }

.hint-box { 
  font-size: 12px; 
  color: var(--text-secondary); 
  background: var(--border-main); 
  border: none; 
}

.modal-footer {
  padding: 16px 24px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-main);
  display: flex; justify-content: space-between; align-items: center;
}
</style>