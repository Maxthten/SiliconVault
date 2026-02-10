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
import { ref, watch, computed } from 'vue'
import { NModal, NCard, NInputNumber, NButton, NCollapse, NCollapseItem, NTable, useMessage, useDialog } from 'naive-ui'
import { useI18n } from '../utils/i18n' // 引入国际化

const props = defineProps<{
  show: boolean
  project: any
}>()

const emit = defineEmits(['update:show', 'success'])
const message = useMessage()
const dialog = useDialog()
const { t } = useI18n()

const multiplier = ref(1)
const deductionList = ref<any[]>([])
const categoryRules = ref<Record<string, any>>({})

// 计算库存允许的最大生产套数
const maxBuildable = computed(() => {
  if (!deductionList.value.length) return 0
  
  let minSets = Infinity
  for (const item of deductionList.value) {
    if (item.base_qty <= 0) continue
    const sets = Math.floor(item.current_stock / item.base_qty)
    if (sets < minSets) minSets = sets
  }
  return minSets === Infinity ? 0 : Math.max(0, minSets)
})

// 识别当前的短板元件
const shortageItem = computed(() => {
  if (!deductionList.value.length) return null
  
  let minSets = Infinity
  let target = null
  for (const item of deductionList.value) {
    if (item.base_qty <= 0) continue
    const sets = Math.floor(item.current_stock / item.base_qty)
    if (sets < minSets) {
      minSets = sets
      target = item
    }
  }
  return target
})

// --- 动态显示逻辑 ---

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
  const rule = categoryRules.value[item.category]
  const rawLayout = rule?.layout

  let layout = { tl: 'value', tr: 'package', bl: 'name' }

  if (rawLayout && !Array.isArray(rawLayout) && typeof rawLayout === 'object') {
    layout = {
      tl: rawLayout.topLeft !== undefined ? rawLayout.topLeft : 'value',
      tr: rawLayout.topRight !== undefined ? rawLayout.topRight : 'package',
      bl: rawLayout.bottomLeft !== undefined ? rawLayout.bottomLeft : 'name'
    }
  } else if (Array.isArray(rawLayout)) {
    layout = { tl: rawLayout[0] || 'value', tr: 'package', bl: rawLayout[1] || 'name' }
  }

  const primary = item[layout.tl] || ''
  const parts: string[] = []
  
  if (item[layout.bl]) parts.push(item[layout.bl])
  if (layout.tr && item[layout.tr]) parts.push(item[layout.tr])

  return {
    primary,
    secondary: parts.join(' · ')
  }
}

watch(() => props.show, async (val) => {
  if (val && props.project) {
    multiplier.value = 1
    await loadRules()
    
    const items = await window.api.getProjectDetail(props.project.id)
    deductionList.value = items.map(i => ({
      ...i,
      base_qty: i.quantity,
      deduct_qty: i.quantity
    }))
  }
})

const updateDeductions = () => {
  deductionList.value.forEach(item => {
    item.deduct_qty = item.base_qty * multiplier.value
  })
}

const setMaxQuantity = () => {
  if (maxBuildable.value > 0) {
    multiplier.value = maxBuildable.value
    updateDeductions()
  } else {
    message.warning(t('bomRun.messages.insufficientStock'))
  }
}

const preCheckAndExecute = () => {
  const lackItems = deductionList.value.filter(item => item.current_stock < item.deduct_qty)
  
  if (lackItems.length > 0) {
    const names = lackItems.map(i => getItemDisplay(i).primary).join('、')
    
    dialog.warning({
      title: t('bomRun.warnings.stockShortage.title'),
      content: t('bomRun.warnings.stockShortage.content', { count: lackItems.length, names }),
      positiveText: t('bomRun.warnings.stockShortage.positive'),
      negativeText: t('common.cancel'),
      onPositiveClick: doExecute
    })
  } else {
    dialog.success({
      title: t('bomRun.dialogs.confirmProduction.title'),
      content: t('bomRun.dialogs.confirmProduction.content', { count: multiplier.value }),
      positiveText: t('bomRun.dialogs.confirmProduction.positive'),
      negativeText: t('common.cancel'),
      onPositiveClick: doExecute
    })
  }
}

const doExecute = async () => {
  try {
    const payload = deductionList.value.map(i => ({
      id: i.inventory_id,
      deductQty: i.deduct_qty
    }))
    
    await window.api.executeDeduction(payload)
    message.success(t('bomRun.messages.deductSuccess', { count: payload.length }))
    emit('update:show', false)
    emit('success')
  } catch (e) {
    message.error(t('bomRun.messages.deductFailed') + e)
  }
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card 
      :title="t('bomRun.title')" 
      class="run-modal" 
      :bordered="false" 
      size="huge"
      role="dialog" 
      aria-modal="true"
    >
      <div class="control-container">
        <div class="control-panel">
          <div class="label">{{ t('bomRun.labels.productionQty') }}</div>
          
          <div class="input-group">
            <n-input-number 
              v-model:value="multiplier" 
              :min="1" 
              size="large" 
              class="multiplier-input"
              @update:value="updateDeductions"
            >
              <template #suffix>{{ t('bomRun.labels.set') }}</template>
            </n-input-number>

            <n-button 
              secondary 
              type="primary" 
              size="large" 
              class="max-btn"
              @click="setMaxQuantity"
            >
              {{ t('bomRun.buttons.max') }} ({{ maxBuildable }})
            </n-button>
          </div>
        </div>

        <div class="stock-info" :class="{ 'stock-warning': multiplier > maxBuildable }">
          <span v-if="multiplier <= maxBuildable">
            {{ t('bomRun.stockInfo.canBuild') }} <strong>{{ maxBuildable }}</strong> {{ t('bomRun.labels.set') }}
            <span v-if="shortageItem" class="limit-info">
              ({{ t('bomRun.stockInfo.limitedBy') }} {{ getItemDisplay(shortageItem).primary }})
            </span>
          </span>
          <span v-else>
            {{ t('bomRun.stockInfo.exceedLimit', { max: maxBuildable }) }}
          </span>
        </div>
      </div>

      <div class="detail-panel">
        <n-collapse arrow-placement="right">
          <n-collapse-item :title="t('bomRun.preview.title', { count: deductionList.length })" name="1">
            <div class="table-container">
              <n-table size="small" :single-line="false" class="dark-table">
                <thead>
                  <tr>
                    <th width="45%">{{ t('bomRun.table.info') }}</th>
                    <th>{{ t('bomRun.table.current') }}</th>
                    <th>{{ t('bomRun.table.deduct') }}</th>
                    <th>{{ t('bomRun.table.remaining') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in deductionList" :key="item.inventory_id">
                    <td>
                      <div class="cell-content">
                        <div class="cell-main">{{ getItemDisplay(item).primary }}</div>
                        <div class="cell-sub">{{ getItemDisplay(item).secondary }}</div>
                      </div>
                    </td>
                    
                    <td :class="{ 'neg-stock': item.current_stock < 0 }">
                      {{ item.current_stock }}
                    </td>
                    
                    <td>
                      <n-input-number 
                        v-model:value="item.deduct_qty" 
                        size="tiny" 
                        :min="0"
                        :show-button="false"
                        class="manual-input" 
                      />
                    </td>

                    <td :class="{ 'warning-text': (item.current_stock - item.deduct_qty) < 0 }">
                      {{ item.current_stock - item.deduct_qty }}
                    </td>
                  </tr>
                </tbody>
              </n-table>
            </div>
          </n-collapse-item>
        </n-collapse>
      </div>

      <template #footer>
        <div class="footer">
          <n-button @click="emit('update:show', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="success" size="large" @click="preCheckAndExecute">
            {{ t('bomRun.buttons.confirmDeduct') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
/* 样式保持不变，此处省略 */
.run-modal { 
  width: 650px; 
  background-color: var(--bg-modal); 
  border-radius: 16px; 
}

:deep(.n-card-header__main) {
  color: var(--text-primary);
}

.control-container {
  background: var(--bg-sidebar); 
  border-radius: 12px; 
  padding: 24px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-main);
}

.control-panel { display: flex; align-items: center; justify-content: center; gap: 16px; }
.input-group { display: flex; align-items: center; gap: 12px; }
.label { font-size: 16px; font-weight: 500; color: var(--text-primary); }
.multiplier-input { width: 140px; text-align: center; }
.max-btn { font-weight: 500; }

.stock-info { font-size: 13px; color: var(--text-tertiary); transition: color 0.3s; }
.limit-info { margin-left: 6px; color: var(--text-tertiary); }
.stock-warning { color: #ffaa00; font-weight: 500; }

.detail-panel { 
  margin-bottom: 20px; 
  border: 1px solid var(--border-main); 
  border-radius: 8px; padding: 0 12px; 
  background: var(--bg-card); /* 表格容器背景 */
}
.table-container { max-height: 300px; overflow-y: auto; margin-bottom: 10px; }


.dark-table { background: transparent; }
:deep(.n-table th) {
  background: rgba(0,0,0,0.02) !important; /* 表头淡色背景 */
  color: var(--text-secondary) !important;
  border-bottom: 1px solid var(--border-main) !important;
}
:deep(.n-table td) { 
  background: transparent; 
  color: var(--text-primary) !important; /* 单元格文字颜色 */
  border-bottom: 1px solid var(--border-main) !important; 
  vertical-align: middle;
}

.cell-content { display: flex; flex-direction: column; justify-content: center; line-height: 1.3; }
.cell-main { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.cell-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 1px; }

.manual-input { width: 80px; }
:deep(.manual-input .n-input) {
  background-color: var(--bg-sidebar) !important;
}

.neg-stock { color: #FF453A; font-weight: bold; }
.warning-text { color: #FF453A; font-weight: 800; }

:deep(.n-card__footer) {
  border-top: 1px solid var(--border-main);
  background: rgba(0,0,0,0.02);
  padding: 16px 24px !important;
}
.footer { display: flex; justify-content: flex-end; gap: 12px; }
</style>