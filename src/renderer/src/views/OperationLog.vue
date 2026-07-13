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
  CloudUploadOutline,
  ListOutline,
  CheckmarkDoneOutline,
  BanOutline
} from '@vicons/ionicons5'
import { NIcon, NSpin, useMessage, useDialog, NInput, NSelect } from 'naive-ui'
import { useI18n } from '../utils/i18n'
import { loadCategoryRules } from '../utils/category-rules'

interface Log {
  id: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT' | 'SYSTEM'
  target_id: number
  event_code?: string
  summary_key?: string
  summary_params?: string
  details?: string
  undoable: number
  undone_at?: string | null
  desc?: string
  old_data?: string
  new_data?: string
  created_at: string
}

const logs = ref<Log[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const filterType = ref<string>('') // 修正初始化为空字符串
const categoryRules = ref<Record<string, any>>({})
const expandedLogIds = ref<Set<number>>(new Set())

const message = useMessage()
const dialog = useDialog()
const { t, locale } = useI18n()

// 显式定义返回类型以匹配 SelectOption
const typeOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t('operationLog.filters.all'), value: '' },
  { label: t('operationLog.events.manualIn'), value: 'INVENTORY_MANUAL_IN' },
  { label: t('operationLog.events.manualOut'), value: 'INVENTORY_MANUAL_OUT' },
  { label: t('operationLog.events.batchAdjust'), value: 'INVENTORY_BATCH_ADJUST' },
  { label: t('operationLog.events.bomDeduction'), value: 'BOM_PRODUCTION_DEDUCTION' },
  { label: t('operationLog.events.csvImport'), value: 'CSV_IMPORT' },
  { label: t('operationLog.types.create'), value: 'OP:CREATE' },
  { label: t('operationLog.types.update'), value: 'OP:UPDATE' },
  { label: t('operationLog.types.delete'), value: 'OP:DELETE' },
  { label: t('operationLog.types.export'), value: 'OP:EXPORT' }
])

const loadRules = async () => {
  try {
    categoryRules.value = await loadCategoryRules()
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
    const matchType = !filterType.value ||
      (filterType.value.startsWith('OP:')
        ? log.op_type === filterType.value.slice(3)
        : log.event_code === filterType.value)
    
    const dynamicTitle = getDynamicLogTitle(log)
    const matchSearch = !searchQuery.value || 
      (log.desc || '').toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      dynamicTitle.toLowerCase().includes(searchQuery.value.toLowerCase())
    
    return matchType && matchSearch
  })
})

const getStockDelta = (log: Log) => {
  if (log.op_type !== 'STOCK') return null
  
  try {
    const detailPayload = log.details ? JSON.parse(log.details) : null
    if (Array.isArray(detailPayload?.items)) {
      const deltas = detailPayload.items.map((item: any) => Number(item.delta) || 0)
      const inbound = deltas.filter((delta: number) => delta > 0).reduce((sum: number, delta: number) => sum + delta, 0)
      const outbound = deltas.filter((delta: number) => delta < 0).reduce((sum: number, delta: number) => sum + Math.abs(delta), 0)
      if (inbound > 0 && outbound > 0) return { val: `+${inbound} / -${outbound}`, type: 'mixed' }
      if (inbound > 0) return { val: `+${inbound}`, type: 'up' }
      if (outbound > 0) return { val: `-${outbound}`, type: 'down' }
      return null
    }

    if (!log.old_data || !log.new_data) return null
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
  if (log.summary_key) {
    try {
      return t(log.summary_key, log.summary_params ? JSON.parse(log.summary_params) : {})
    } catch {
      return t(log.summary_key)
    }
  }

  // 兼容第一阶段将翻译信息保存在 desc 中的日志
  try {
    if (log.desc?.startsWith('{')) {
      const jsonDesc = JSON.parse(log.desc)
      if (jsonDesc.key) {
        return t(jsonDesc.key, jsonDesc.params)
      }
    }
  } catch (e) {
    // 解析失败，说明不是 JSON 格式，回退到后续逻辑
  }

  // 2. 旧版日志的兼容处理逻辑 (IMPORT/EXPORT 直接显示)
  if (['IMPORT', 'EXPORT'].includes(log.op_type)) return log.desc || log.event_code || log.op_type

  try {
    const snapshot = log.new_data ? JSON.parse(log.new_data) : (log.old_data ? JSON.parse(log.old_data) : null)
    if (!snapshot) return log.desc || log.event_code || log.op_type

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
    return log.desc || log.event_code || log.op_type
  }
}

const handleUndo = (log: Log) => {
  if (!log.undoable) {
    message.warning(t('operationLog.messages.notUndoable'))
    return
  }
  if (log.undone_at) {
    message.warning(t('operationLog.messages.alreadyUndone'))
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

const getLogDetails = (log: Log) => {
  if (!log.details) return []
  try {
    const payload = JSON.parse(log.details)
    if (Array.isArray(payload?.items)) return payload.items
    if (Array.isArray(payload?.changes)) {
      return payload.changes.map((change: any) => ({
        inventory_id: change.id,
        name: change.after?.name || change.before?.name || '',
        value: change.after?.value || change.before?.value || '',
        delta: (change.after?.quantity || 0) - (change.before?.quantity || 0),
        action: change.action
      }))
    }
  } catch {
    return []
  }
  return []
}

const toggleDetails = (logId: number) => {
  const next = new Set(expandedLogIds.value)
  next.has(logId) ? next.delete(logId) : next.add(logId)
  expandedLogIds.value = next
}

const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleString(locale.value, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(/\//g, '-')
}

const getOpConfig = (log: Log) => {
  switch (log.event_code) {
    case 'INVENTORY_MANUAL_IN': return { icon: ArrowUpOutline, color: '#30D158', label: t('operationLog.events.manualIn') }
    case 'INVENTORY_MANUAL_OUT': return { icon: ArrowDownOutline, color: '#FF453A', label: t('operationLog.events.manualOut') }
    case 'INVENTORY_BATCH_ADJUST': return { icon: ListOutline, color: '#FF9F0A', label: t('operationLog.events.batchAdjust') }
    case 'BOM_PRODUCTION_DEDUCTION': return { icon: CubeOutline, color: '#FF453A', label: t('operationLog.events.bomDeduction') }
    case 'CSV_IMPORT': return { icon: CloudDownloadOutline, color: '#BF5AF2', label: t('operationLog.events.csvImport') }
  }
  switch (log.op_type) {
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
              <div class="dot" :style="{ borderColor: getOpConfig(log).color }">
                <n-icon :component="getOpConfig(log).icon" :color="getOpConfig(log).color" size="14" />
              </div>
            </div>

            <div class="log-card-wrapper">
              <div class="log-card" :class="{ 'is-undone': Boolean(log.undone_at) }">
                <div class="log-info">
                  <div class="log-header">
                    <span class="op-tag" :style="{ color: getOpConfig(log).color, borderColor: getOpConfig(log).color }">
                      {{ getOpConfig(log).label }}
                    </span>
                    <span class="log-time">{{ formatTime(log.created_at) }}</span>
                    <span v-if="log.undone_at" class="status-tag undone">
                      <n-icon :component="CheckmarkDoneOutline" /> {{ t('operationLog.status.undone') }}
                    </span>
                    <span v-else-if="!log.undoable" class="status-tag locked">
                      <n-icon :component="BanOutline" /> {{ t('operationLog.status.notUndoable') }}
                    </span>
                  </div>

                  <div class="log-desc" :title="getDynamicLogTitle(log)">
                    {{ getDynamicLogTitle(log) }}
                  </div>
                </div>

                <div v-if="log.op_type === 'STOCK' && getStockDelta(log)" class="delta-display" :class="getStockDelta(log)?.type">
                  <span class="delta-val">{{ getStockDelta(log)?.val }}</span>
                  <n-icon
                    v-if="getStockDelta(log)?.type !== 'mixed'"
                    :component="getStockDelta(log)?.type === 'up' ? ArrowUpOutline : ArrowDownOutline"
                  />
                </div>

                <div
                  v-if="getLogDetails(log).length > 0"
                  class="log-action"
                  :title="t('operationLog.details.title')"
                  @click="toggleDetails(log.id)"
                >
                  <n-icon :component="ListOutline" />
                </div>

                <div
                  v-if="log.undoable && !log.undone_at"
                  class="log-action"
                  :title="t('operationLog.dialog.undoPositive')"
                  @click="handleUndo(log)"
                >
                  <n-icon :component="ReturnDownBackOutline" />
                </div>
              </div>

              <div v-if="expandedLogIds.has(log.id)" class="log-details">
                <div
                  v-for="detail in getLogDetails(log)"
                  :key="`${log.id}-${detail.inventory_id}`"
                  class="detail-row"
                >
                  <span
                    class="detail-name"
                    :title="`${detail.name || t('common.unknown')} ${detail.value || ''}`"
                  >
                    {{ detail.name || t('common.unknown') }} {{ detail.value || '' }}
                  </span>
                  <span v-if="detail.action" class="detail-action">{{ t(`operationLog.details.${detail.action}`) }}</span>
                  <span
                    v-else
                    class="detail-delta"
                    :class="{ up: detail.delta > 0, down: detail.delta < 0 }"
                  >
                    {{ detail.delta > 0 ? `+${detail.delta}` : detail.delta }}
                  </span>
                </div>
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
  height: 100%;
  min-height: 0;
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
.search-box { flex: 1; min-width: 140px; }

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

.log-card-wrapper { flex: 1; min-width: 0; }

.log-card {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  transition: all 0.2s;
}
.log-card.is-undone { opacity: 0.62; }
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
.status-tag {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; padding: 1px 5px; border-radius: 4px;
}
.status-tag.undone { color: #30D158; background: rgba(48, 209, 88, 0.12); }
.status-tag.locked { color: var(--text-tertiary); background: var(--border-main); }
.log-desc { font-size: 14px; color: var(--text-primary); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.delta-display {
  display: flex; align-items: center; font-weight: 800; font-size: 16px; gap: 2px;
}
.delta-display.up { color: #30D158; }
.delta-display.down { color: #FF453A; }
.delta-display.mixed { color: #FF9F0A; font-size: 13px; }

.log-action {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  color: var(--text-tertiary); border-radius: 8px; cursor: pointer; transition: all 0.2s;
  background: var(--border-main);
}
.log-action:hover { color: var(--text-primary); background: var(--border-hover); }

.log-details {
  margin-top: 6px; padding: 8px 12px;
  border: 1px solid var(--border-main); border-radius: 10px;
  background: var(--bg-card);
}
.detail-row {
  display: flex; align-items: center; gap: 12px;
  padding: 5px 0; color: var(--text-secondary); font-size: 12px;
  border-bottom: 1px dashed var(--border-main);
}
.detail-row:last-child { border-bottom: none; }
.detail-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-delta, .detail-action { font-family: monospace; font-weight: 700; }
.detail-delta.up { color: #30D158; }
.detail-delta.down { color: #FF453A; }
.detail-action { color: #BF5AF2; }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 768px) {
  .toolbar { flex-wrap: wrap; }
  .filter-group { flex: 1 1 140px; }
  .search-box { flex: 1 1 220px; }
  .title-badge { order: 3; }
  .log-card { flex-wrap: wrap; }
  .log-info { min-width: 100%; }
  .delta-display { margin-left: auto; }
}
</style>
