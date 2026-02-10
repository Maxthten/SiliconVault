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
  NModal, NCard, NButton, NIcon, NTabs, NTabPane, 
  NScrollbar, useMessage 
} from 'naive-ui'
import { 
  AlertCircleOutline, ArrowForward, CopyOutline, 
  CloseCircleOutline, CubeOutline, LayersOutline, TimeOutline,
  ImageOutline
} from '@vicons/ionicons5'
import { useI18n } from '../utils/i18n' // 引入国际化

import type { ScanResult, ImportStrategy } from '../../../preload/index'

const props = defineProps<{
  show: boolean
  scanResult: ScanResult | null
}>()

const emit = defineEmits(['update:show', 'confirm'])
const message = useMessage()
const { t } = useI18n()

const activeTab = ref<'inventory' | 'projects'>('inventory')
const isImporting = ref(false)

const inventoryDecisions = ref<Record<number, ImportStrategy>>({})
const projectDecisions = ref<Record<number, ImportStrategy>>({})
const categoryRules = ref<Record<string, any>>({})

const currentBatchMode = computed(() => {
  if (!props.scanResult) return { inventory: null, projects: null }

  const checkUniformity = (type: 'inventory' | 'projects') => {
    const decisions = type === 'inventory' ? inventoryDecisions.value : projectDecisions.value
    const conflicts = props.scanResult!.conflicts[type]
    
    if (conflicts.length === 0) return null
    
    const firstId = conflicts[0].remote.id
    if (!firstId) return null

    const firstStrategy = decisions[firstId]
    const isUniform = conflicts.every(c => c.remote.id && decisions[c.remote.id] === firstStrategy)
    
    return isUniform ? firstStrategy : null
  }

  return {
    inventory: checkUniformity('inventory'),
    projects: checkUniformity('projects')
  }
})

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
  if (!item) return { primary: 'Unknown', secondary: '' }

  const rule = categoryRules.value[item.category]
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

  const parts: string[] = []
  // 属性名国际化
  if (item.package) parts.push(`${t('inventory.package')}: ${item.package}`)

  if (targetKey === 'value') {
     if (item.name && item.name !== primary) parts.push(`${t('importConflict.item.name')}: ${item.name}`)
  } else {
     if (item.value) parts.push(`${t('importConflict.item.value')}: ${item.value}`)
  }

  return {
    primary,
    secondary: parts.join(' | ')
  }
}

watch(() => props.scanResult, (val) => {
  if (val) {
    inventoryDecisions.value = {}
    projectDecisions.value = {}
    
    val.conflicts.inventory.forEach(c => {
      if (c.remote.id) inventoryDecisions.value[c.remote.id] = 'keep_both'
    })
    val.conflicts.projects.forEach(c => {
      if (c.remote.id) projectDecisions.value[c.remote.id] = 'keep_both'
    })
  }
}, { immediate: true })

watch(() => props.show, (val) => {
  if (val) {
    loadRules()
  }
})

const applyToAll = (type: 'inventory' | 'projects', strategy: ImportStrategy) => {
  if (!props.scanResult) return
  const target = type === 'inventory' ? inventoryDecisions.value : projectDecisions.value
  const conflicts = props.scanResult.conflicts[type]
  
  conflicts.forEach(c => {
    if (c.remote.id) target[c.remote.id] = strategy
  })
}

const formatDate = (ts?: string | number) => {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString()
}

const handleConfirm = async () => {
  if (!props.scanResult) return
  isImporting.value = true
  
  try {
    const rawInventoryStrategies = JSON.parse(JSON.stringify(inventoryDecisions.value))
    const rawProjectStrategies = JSON.parse(JSON.stringify(projectDecisions.value))

    const strategies = {
      inventory: rawInventoryStrategies,
      projects: rawProjectStrategies
    }
    
    const res = await window.api.executeImportBundle(props.scanResult.scanId, strategies)
    
    if (res.success) {
      message.success(t('dataCenter.messages.importCompleted'))
      emit('update:show', false)
      emit('confirm') 
    }
  } catch (e: any) {
    console.error('前端捕获到导入错误:', e)
    message.error(`${t('importConflict.messages.failed')}: ${e.message || 'Unknown'}`)
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <n-modal 
    :show="show" 
    :mask-closable="false"
    @update:show="(v) => !isImporting && emit('update:show', v)"
    transform-origin="center"
  >
    <n-card class="conflict-modal" :bordered="false" role="dialog" aria-modal="true">
      
      <div class="modal-header">
        <div class="header-title">
          <n-icon size="24" :component="AlertCircleOutline" color="#FF9F0A" />
          <span>{{ t('importConflict.title') }}</span>
        </div>
        <div class="header-summary" v-if="scanResult">
          {{ t('importConflict.summary.detected') }} <strong class="highlight">{{ scanResult.conflicts.inventory.length + scanResult.conflicts.projects.length }}</strong> {{ t('importConflict.summary.conflicts') }}，
          <span class="new-item-text">{{ t('importConflict.summary.newItems', { count: scanResult.newItems.inventory + scanResult.newItems.projects }) }}</span>
        </div>
      </div>

      <div class="modal-content" v-if="scanResult">
        <n-tabs type="segment" v-model:value="activeTab">
          
          <n-tab-pane name="inventory" :tab="t('importConflict.tabs.inventory')">
            <div class="conflict-list">
              <div v-if="scanResult.conflicts.inventory.length === 0" class="empty-state">
                <p>{{ t('importConflict.noConflicts') }}</p>
              </div>

              <div class="batch-bar" v-else>
                <span>{{ t('importConflict.batch.label') }}</span>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'keep_both' ? 'primary' : 'default'"
                  @click="applyToAll('inventory', 'keep_both')"
                >
                  {{ t('importConflict.batch.keep') }}
                </n-button>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'skip' ? 'primary' : 'default'"
                  @click="applyToAll('inventory', 'skip')"
                >
                  {{ t('importConflict.batch.skip') }}
                </n-button>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'overwrite' ? 'warning' : 'default'"
                  @click="applyToAll('inventory', 'overwrite')"
                >
                  {{ t('importConflict.batch.overwrite') }}
                </n-button>
              </div>

              <n-scrollbar style="max-height: 400px">
                <div 
                  v-for="item in scanResult.conflicts.inventory" 
                  :key="item.remote.id" 
                  class="conflict-row"
                >
                  <div class="card remote">
                    <div class="badges-container">
                      <div v-if="item.hasFileDiff" class="mini-badge warning">
                        <n-icon :component="ImageOutline" /> {{ t('importConflict.badges.resourceChange') }}
                      </div>
                      <div class="mini-badge info">{{ t('importConflict.badges.bundle') }}</div>
                    </div>

                    <div class="info-line">
                      <n-icon :component="CubeOutline" /> 
                      <strong>{{ getItemDisplay(item.remote).primary }}</strong>
                    </div>
                    <div class="detail-line">
                      {{ getItemDisplay(item.remote).secondary }}
                    </div>
                    <div class="detail-line stock" :class="{ diff: item.remote.quantity !== item.local.quantity }">
                      {{ t('importConflict.fields.stock') }}: {{ item.remote.quantity }}
                    </div>
                  </div>

                  <div class="decision-area">
                    <n-icon :component="ArrowForward" class="arrow-icon" />
                    
                    <div class="radio-group" v-if="item.remote.id">
                      <div 
                        class="radio-btn"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'keep_both' }"
                        @click="inventoryDecisions[item.remote.id] = 'keep_both'"
                      >
                        <n-icon :component="CopyOutline" />
                        <span>{{ t('importConflict.strategies.keepBoth') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.keepBothTip') }}</div>
                      </div>

                      <div 
                        class="radio-btn"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'skip' }"
                        @click="inventoryDecisions[item.remote.id] = 'skip'"
                      >
                        <n-icon :component="CloseCircleOutline" />
                        <span>{{ t('importConflict.strategies.skip') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.skipTip') }}</div>
                      </div>

                      <div 
                        class="radio-btn danger"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'overwrite' }"
                        @click="inventoryDecisions[item.remote.id] = 'overwrite'"
                      >
                        <n-icon :component="AlertCircleOutline" />
                        <span>{{ t('importConflict.strategies.overwrite') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.overwriteTip') }}</div>
                      </div>
                    </div>
                  </div>

                  <div class="card local">
                    <div class="mini-badge local-badge">{{ t('importConflict.badges.local') }}</div>
                    <div class="info-line">
                      <n-icon :component="CubeOutline" /> 
                      <strong>{{ getItemDisplay(item.local).primary }}</strong>
                    </div>
                    <div class="detail-line">
                      {{ getItemDisplay(item.local).secondary }}
                    </div>
                    <div class="detail-line stock">{{ t('importConflict.fields.stock') }}: {{ item.local.quantity }}</div>
                  </div>
                </div>
              </n-scrollbar>
            </div>
          </n-tab-pane>

          <n-tab-pane name="projects" :tab="t('importConflict.tabs.projects')">
            <div class="conflict-list">
              <div v-if="scanResult.conflicts.projects.length === 0" class="empty-state">
                <p>{{ t('importConflict.noConflicts') }}</p>
              </div>

              <div class="batch-bar" v-else>
                 <span>{{ t('importConflict.batch.label') }}</span>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'keep_both' ? 'primary' : 'default'"
                   @click="applyToAll('projects', 'keep_both')"
                 >
                   {{ t('importConflict.batch.keep') }}
                 </n-button>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'skip' ? 'primary' : 'default'"
                   @click="applyToAll('projects', 'skip')"
                 >
                   {{ t('importConflict.batch.skip') }}
                 </n-button>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'overwrite' ? 'warning' : 'default'"
                   @click="applyToAll('projects', 'overwrite')"
                 >
                   {{ t('importConflict.batch.overwrite') }}
                 </n-button>
              </div>

              <n-scrollbar style="max-height: 400px">
                <div 
                  v-for="proj in scanResult.conflicts.projects" 
                  :key="proj.remote.id" 
                  class="conflict-row"
                >
                  <div class="card remote">
                    <div class="badges-container">
                      <div v-if="proj.hasFileDiff" class="mini-badge warning">
                        <n-icon :component="ImageOutline" /> {{ t('importConflict.badges.fileChange') }}
                      </div>
                      <div class="mini-badge info">{{ t('importConflict.badges.bundle') }}</div>
                    </div>

                    <div class="info-line">
                      <n-icon :component="LayersOutline" /> 
                      <strong>{{ proj.remote.name }}</strong>
                    </div>
                      <div class="detail-line date" :class="{ diff: proj.remote.created_at !== proj.local.created_at }">
                      <n-icon :component="TimeOutline" /> {{ formatDate(proj.remote.created_at) }}
                    </div>
                  </div>

                  <div class="decision-area">
                    <n-icon :component="ArrowForward" class="arrow-icon" />
                    <div class="radio-group" v-if="proj.remote.id">
                        
                      <div 
                        class="radio-btn"
                        :class="{ active: projectDecisions[proj.remote.id] === 'keep_both' }"
                        @click="projectDecisions[proj.remote.id] = 'keep_both'"
                      >
                        <n-icon :component="CopyOutline" />
                        <span>{{ t('importConflict.strategies.keepBoth') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.keepBothTip') }}</div>
                      </div>

                      <div 
                        class="radio-btn"
                        :class="{ active: projectDecisions[proj.remote.id] === 'skip' }"
                        @click="projectDecisions[proj.remote.id] = 'skip'"
                      >
                        <n-icon :component="CloseCircleOutline" />
                        <span>{{ t('importConflict.strategies.skip') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.skipTip') }}</div>
                      </div>

                      <div 
                        class="radio-btn danger"
                        :class="{ active: projectDecisions[proj.remote.id] === 'overwrite' }"
                        @click="projectDecisions[proj.remote.id] = 'overwrite'"
                      >
                        <n-icon :component="AlertCircleOutline" />
                        <span>{{ t('importConflict.strategies.overwrite') }}</span>
                        <div class="sub-tip">{{ t('importConflict.strategies.overwriteTip') }}</div>
                      </div>

                    </div>
                  </div>

                  <div class="card local">
                    <div class="mini-badge local-badge">{{ t('importConflict.badges.local') }}</div>
                    <div class="info-line">
                      <n-icon :component="LayersOutline" /> 
                      <strong>{{ proj.local.name }}</strong>
                    </div>
                    <div class="detail-line date">
                      <n-icon :component="TimeOutline" /> {{ formatDate(proj.local.created_at) }}
                    </div>
                  </div>
                </div>
              </n-scrollbar>
            </div>
          </n-tab-pane>

        </n-tabs>
      </div>

      <div class="modal-footer">
        <div class="footer-tip">
          <n-icon :component="AlertCircleOutline" /> 
          <span>{{ t('importConflict.footerTip') }}</span>
        </div>
        <div class="footer-btns">
          <n-button @click="emit('update:show', false)" :disabled="isImporting">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="isImporting" @click="handleConfirm">
            {{ t('importConflict.actions.execute') }}
          </n-button>
        </div>
      </div>

    </n-card>
  </n-modal>
</template>

<style scoped>
/* 样式保持不变，此处省略以节省篇幅 */
.conflict-modal {
  width: 900px;
  background-color: var(--bg-modal); 
  border-radius: 16px;
  overflow: hidden;
}

:deep(.n-card__content) { padding: 0 !important; }

.modal-header {
  padding: 20px 24px;
  background: var(--bg-sidebar); 
  border-bottom: 1px solid var(--border-main);
}
.header-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: bold; color: var(--text-primary); margin-bottom: 8px; }
.header-summary { font-size: 14px; color: var(--text-tertiary); }
.highlight { color: #FF9F0A; font-size: 16px; margin: 0 4px; }
.new-item-text { color: #30D158; }

.modal-content { padding: 0; min-height: 400px; }
:deep(.n-tabs-nav) { padding: 12px 24px 0 24px; }

.conflict-list { padding: 16px 24px; background: var(--bg-modal); }
.batch-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: var(--text-tertiary); font-size: 12px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 300px; color: var(--text-tertiary); gap: 16px;
}

.conflict-row {
  display: flex; align-items: stretch; gap: 12px; margin-bottom: 16px;
  background: var(--bg-card); 
  border: 1px solid var(--border-main);
}

.card {
  flex: 1; border-radius: 8px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px; position: relative;
  border: 1px solid transparent;
}
.card.local { 
  border-color: var(--border-main);
  background: var(--bg-sidebar); /* 本机卡片背景稍深 */
}
.card.remote { 
  border-color: rgba(10, 132, 255, 0.2); 
  background: rgba(10, 132, 255, 0.05); /* 资源包卡片保持淡蓝 */
}

.badges-container {
  position: absolute; top: 8px; right: 8px; display: flex; gap: 6px;
}

.mini-badge {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; 
  display: flex; align-items: center; gap: 4px;
}
.mini-badge.info { background: #0A84FF; color: white; }
.mini-badge.warning { background: #FF9F0A; color: black; font-weight: bold; }
.mini-badge.local-badge { position: absolute; top: 8px; right: 8px; background: var(--border-main); color: var(--text-tertiary); }

.info-line { display: flex; align-items: center; gap: 6px; color: var(--text-primary); font-size: 14px; margin-top: 4px; }
.detail-line { font-size: 12px; color: var(--text-tertiary); }
.stock { font-family: monospace; font-size: 13px; }
.diff { color: #FF9F0A; font-weight: bold; }

.decision-area {
  width: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
}
.arrow-icon { color: var(--text-tertiary); font-size: 20px; opacity: 0.5; }

.radio-group { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.radio-btn {
  background: var(--border-main); /* 默认按钮背景 */
  padding: 8px 12px; border-radius: 8px;
  cursor: pointer; display: flex; flex-direction: column; align-items: flex-start;
  border: 1px solid transparent; transition: all 0.2s; position: relative;
}
.radio-btn span { font-size: 13px; color: var(--text-secondary); font-weight: bold; display: flex; align-items: center; gap: 6px; }
.sub-tip { font-size: 10px; color: var(--text-tertiary); margin-left: 20px; }

.radio-btn:hover { background: var(--border-hover); }
.radio-btn.active { background: rgba(48, 209, 88, 0.15); border-color: #30D158; }
.radio-btn.active span { color: #30D158; }

.radio-btn.danger.active { background: rgba(255, 69, 58, 0.15); border-color: #FF453A; }
.radio-btn.danger.active span { color: #FF453A; }

.modal-footer {
  padding: 16px 24px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-main);
  display: flex; justify-content: space-between; align-items: center;
}
.footer-tip { font-size: 12px; color: var(--text-tertiary); display: flex; align-items: center; gap: 6px; }
.footer-btns { display: flex; gap: 12px; }
</style>