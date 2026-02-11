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
import { ref, onMounted, computed } from 'vue'
import { 
  TimeOutline, 
  TrashOutline, 
  CreateOutline, 
  AddCircleOutline, 
  CubeOutline, 
  ReturnDownBackOutline, 
  InfiniteOutline,
  Search,
  ArrowUpOutline,
  ArrowDownOutline,
  CloudDownloadOutline,
  CloudUploadOutline
} from '@vicons/ionicons5'
import { NIcon, NSpin, useMessage, useDialog, NInput, NSelect } from 'naive-ui'
import { useI18n } from '../utils/i18n'

interface Log {
  id: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT'
  target_id: number
  desc: string
  old_data?: string
  new_data?: string
  created_at: string
}

const logs = ref<Log[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const filterType = ref<string>('') // 修正初始化为空字符串
const categoryRules = ref<Record<string, any>>({})

const message = useMessage()
const dialog = useDialog()
const { t, locale } = useI18n()

// 显式定义返回类型以匹配 SelectOption
const typeOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t('operationLog.filters.all'), value: '' },
  { label: t('operationLog.types.stock'), value: 'STOCK' },
  { label: t('operationLog.types.create'), value: 'CREATE' },
  { label: t('operationLog.types.update'), value: 'UPDATE' },
  { label: t('operationLog.types.delete'), value: 'DELETE' },
  { label: t('operationLog.types.import'), value: 'IMPORT' },
  { label: t('operationLog.types.export'), value: 'EXPORT' }
])

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

const loadLogs = async () => {
  isLoading.value = true
  await loadRules()
  try {
    logs.value = await window.api.getLogs()
  } catch (e) {
    console.error(e)
    message.error(t('operationLog.messages.loadFailed'))
  } finally {
    isLoading.value = false
  }
}

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    // 空字符串表示全部
    const matchType = !filterType.value || log.op_type === filterType.value
    
    const dynamicTitle = getDynamicLogTitle(log)
    const matchSearch = !searchQuery.value || 
      log.desc.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      dynamicTitle.toLowerCase().includes(searchQuery.value.toLowerCase())
    
    return matchType && matchSearch
  })
})

const getStockDelta = (log: Log) => {
  if (log.op_type !== 'STOCK' || !log.old_data || !log.new_data) return null
  
  try {
    const oldQ = JSON.parse(log.old_data).quantity || 0
    const newQ = JSON.parse(log.new_data).quantity || 0
    const diff = newQ - oldQ
    
    if (diff > 0) return { val: `+${diff}`, type: 'up' }
    if (diff < 0) return { val: `${diff}`, type: 'down' }
    return null
  } catch (e) {
    return null
  }
}

const getDynamicLogTitle = (log: Log) => {
  // 1. 优先尝试解析 JSON 格式的新版日志
  try {
    if (log.desc.startsWith('{')) {
      const jsonDesc = JSON.parse(log.desc)
      if (jsonDesc.key) {
        return t(jsonDesc.key, jsonDesc.params)
      }
    }
  } catch (e) {
    // 解析失败，说明不是 JSON 格式，回退到后续逻辑
  }

  // 2. 旧版日志的兼容处理逻辑 (IMPORT/EXPORT 直接显示)
  if (['IMPORT', 'EXPORT'].includes(log.op_type)) return log.desc

  try {
    const snapshot = log.new_data ? JSON.parse(log.new_data) : (log.old_data ? JSON.parse(log.old_data) : null)
    if (!snapshot) return log.desc

    const rule = categoryRules.value[snapshot.category]
    let targetKey = 'name'

    if (rule?.layout) {
      if (typeof rule.layout === 'object' && rule.layout.topLeft) {
        targetKey = rule.layout.topLeft
      } else if (Array.isArray(rule.layout) && rule.layout[0]) {
        targetKey = rule.layout[0]
      }
    }

    let displayName = snapshot[targetKey]
    if (!displayName) displayName = snapshot.name || t('common.unknown')

    // 根据操作类型拼接前缀 (兼容旧数据)
    switch (log.op_type) {
      case 'CREATE': return `${t('operationLog.prefixes.create')}: ${displayName}`
      case 'UPDATE': return `${t('operationLog.prefixes.update')}: ${displayName}`
      case 'DELETE': return `${t('operationLog.prefixes.delete')}: ${displayName}`
      case 'STOCK': return `${t('operationLog.prefixes.stock')}: ${displayName}`
      default: return `${log.op_type}: ${displayName}`
    }
  } catch (e) {
    return log.desc
  }
}

const handleUndo = (log: Log) => {
  if (log.op_type === 'IMPORT') {
    message.warning(t('operationLog.messages.importUndoWarning'))
    return
  }

  if (log.op_type === 'EXPORT') {
    return
  }

  dialog.warning({
    title: t('operationLog.dialog.undoTitle'),
    content: t('operationLog.dialog.undoConfirm', { title: getDynamicLogTitle(log) }),
    positiveText: t('operationLog.dialog.undoPositive'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.api.undoOperation(log.id)
        message.success(t('operationLog.messages.undoSuccess'))
        loadLogs()
      } catch (e) {
        console.error(e)
        message.error(t('operationLog.messages.undoFailed'))
      }
    }
  })
}

const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleString(locale.value, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(/\//g, '-')
}

const getOpConfig = (type: string) => {
  switch (type) {
    case 'CREATE': return { icon: AddCircleOutline, color: '#30D158', label: t('operationLog.types.create') }
    case 'DELETE': return { icon: TrashOutline, color: '#FF453A', label: t('operationLog.types.delete') }
    case 'UPDATE': return { icon: CreateOutline, color: '#0A84FF', label: t('operationLog.types.update') }
    case 'STOCK':  return { icon: CubeOutline, color: '#FF9F0A', label: t('operationLog.types.stock') }
    case 'IMPORT': return { icon: CloudDownloadOutline, color: '#BF5AF2', label: t('operationLog.types.import') }
    case 'EXPORT': return { icon: CloudUploadOutline, color: '#5E5CE6', label: t('operationLog.types.export') }
    default:       return { icon: TimeOutline, color: '#888', label: t('operationLog.types.record') }
  }
}

onMounted(() => { loadLogs() })
</script>

<template>
  <div class="log-page">
    
    <div class="toolbar">
      
      <div class="filter-group">
        <n-select 
          v-model:value="filterType" 
          :options="typeOptions" 
          :placeholder="t('operationLog.filters.all')" 
          class="mini-select" 
          size="small" 
        />
      </div>

      <div class="search-box">
        <n-input 
          v-model:value="searchQuery" 
          :placeholder="t('operationLog.searchPlaceholder')" 
          round clearable class="ios-search"
        >
          <template #prefix><n-icon :component="Search" /></template>
        </n-input>
      </div>

      <div class="title-badge">
        <n-icon :component="InfiniteOutline" />
        <span>{{ t('operationLog.title') }}</span>
      </div>

    </div>

    <div class="content">
      <n-spin :show="isLoading">
        
        <div v-if="filteredLogs.length === 0 && !isLoading" class="empty-state">
          <n-icon size="64" :component="TimeOutline" class="empty-icon" />
          <p>{{ t('operationLog.empty') }}</p>
        </div>

        <div v-else class="timeline-list">
          <div class="timeline-line"></div>

          <div 
            v-for="(log, index) in filteredLogs" 
            :key="log.id" 
            class="timeline-item"
            :style="{ animationDelay: index * 0.03 + 's' }"
          >
            <div class="time-node">
              <div class="dot" :style="{ borderColor: getOpConfig(log.op_type).color }">
                <n-icon :component="getOpConfig(log.op_type).icon" :color="getOpConfig(log.op_type).color" size="14" />
              </div>
            </div>

            <div class="log-card">
              <div class="log-info">
                <div class="log-header">
                  <span class="op-tag" :style="{ color: getOpConfig(log.op_type).color, borderColor: getOpConfig(log.op_type).color }">
                    {{ getOpConfig(log.op_type).label }}
                  </span>
                  <span class="log-time">{{ formatTime(log.created_at) }}</span>
                </div>
                
                <div class="log-desc">{{ getDynamicLogTitle(log) }}</div>
              </div>

              <div v-if="log.op_type === 'STOCK' && getStockDelta(log)" class="delta-display" :class="getStockDelta(log)?.type">
                <span class="delta-val">{{ getStockDelta(log)?.val }}</span>
                <n-icon :component="getStockDelta(log)?.type === 'up' ? ArrowUpOutline : ArrowDownOutline" />
              </div>

              <div 
                v-if="log.op_type !== 'IMPORT' && log.op_type !== 'EXPORT'" 
                class="log-action" 
                @click="handleUndo(log)"
              >
                <n-icon :component="ReturnDownBackOutline" />
              </div>
            </div>
          </div>
        </div>

      </n-spin>
    </div>
  </div>
</template>

<style scoped>
/* 样式保持不变 */
.log-page {
  height: 100vh;
  display: flex; flex-direction: column; 
  background: transparent; 
}

.toolbar {
  padding: 12px 16px; display: flex; gap: 12px; align-items: center;
  position: sticky; top: 0; z-index: 100;

  background: var(--bg-sidebar); 
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-main);
}
.filter-group { width: 140px; flex-shrink: 0; }
.search-box { flex: 1; }

.title-badge { 
  display: flex; align-items: center; gap: 6px; 
  color: #0A84FF; font-weight: 800; font-size: 14px; 
  background: rgba(10, 132, 255, 0.1); padding: 4px 10px; border-radius: 12px;
}

:deep(.n-input .n-input__input-el),
:deep(.n-base-selection-label) {
  color: var(--text-primary) !important;
  caret-color: var(--text-primary);
}
:deep(.n-input .n-input__placeholder),
:deep(.n-base-selection-placeholder) {
  color: var(--text-tertiary) !important;
}

:deep(.n-input), :deep(.n-base-selection-label) {
  background-color: rgba(118, 118, 128, 0.24) !important; 
  border: 1px solid transparent !important; 
  border-radius: 8px !important;
}

:global([data-theme="light"]) .toolbar :deep(.n-input),
:global([data-theme="light"]) .toolbar :deep(.n-base-selection-label) {
  background-color: rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.content { flex: 1; overflow-y: auto; padding: 20px 20px 100px 20px; }
.empty-state { margin-top: 100px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--text-tertiary); }
.empty-icon { color: var(--text-tertiary); }

.timeline-list { position: relative; max-width: 800px; margin: 0 auto; }


.timeline-line { 
  position: absolute; top: 10px; bottom: 0; left: 19px; width: 2px; 
  background: var(--border-main); 
  z-index: 0; 
}

.timeline-item {
  display: flex; gap: 16px; margin-bottom: 16px; position: relative; z-index: 1;
  animation: slideUp 0.3s ease-out backwards;
}

.time-node { flex-shrink: 0; width: 40px; display: flex; justify-content: center; }
.dot {
  width: 30px; height: 30px; 
  background: var(--bg-body); 
  border: 2px solid; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; 
  box-shadow: 0 0 0 4px rgba(0,0,0,0.05); 
}


.log-card {
  flex: 1; 
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  transition: all 0.2s;
}
.log-card:hover { 
  background: var(--bg-card);
  border-color: var(--border-hover); 
  transform: translateY(-2px); 
}

.log-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.log-header { display: flex; align-items: center; gap: 8px; }

.op-tag {
  font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
  background: var(--border-main); 
  border: 1px solid;
}
.log-time { font-size: 12px; color: var(--text-tertiary); font-family: monospace; }
.log-desc { font-size: 14px; color: var(--text-primary); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.delta-display {
  display: flex; align-items: center; font-weight: 800; font-size: 16px; gap: 2px;
}
.delta-display.up { color: #30D158; }
.delta-display.down { color: #FF453A; }

.log-action {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  color: var(--text-tertiary); border-radius: 8px; cursor: pointer; transition: all 0.2s;
  background: var(--border-main);
}
.log-action:hover { color: var(--text-primary); background: var(--border-hover); }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 768px) {
  .log-card { flex-wrap: wrap; }
  .log-info { min-width: 100%; }
  .delta-display { margin-left: auto; }
}
</style>