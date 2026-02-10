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
import { ref, watch, nextTick, computed } from 'vue'
import { 
  NModal, NCard, NInput, NForm, NFormItem, NButton, 
  NDivider, useMessage, NIcon 
} from 'naive-ui'
import { 
  LocationOutline, CubeOutline, 
  HardwareChipOutline, TextOutline 
} from '@vicons/ionicons5'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from '../utils/i18n' // 引入国际化

const props = defineProps<{
  show: boolean
  category: string
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()
const { t } = useI18n()

// 字段定义 - 使用 computed 确保能动态翻译
const ALL_FIELDS = computed(() => [
  { key: 'value', label: t('categoryRule.fields.value'), icon: TextOutline },
  { key: 'name', label: t('categoryRule.fields.name'), icon: HardwareChipOutline },
  { key: 'package', label: t('categoryRule.fields.package'), icon: CubeOutline },
  { key: 'location', label: t('categoryRule.fields.location'), icon: LocationOutline }
])

// 表单数据
const form = ref({
  nameLabel: '', namePlaceholder: '',
  valueLabel: '', valuePlaceholder: '',
  packageLabel: '',
  layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' } as any 
})

// 拖拽状态管理
const poolList = ref<any[]>([])
const slotTopLeft = ref<any[]>([])
const slotTopRight = ref<any[]>([])
const slotBottomLeft = ref<any[]>([])
const slotBottomRight = ref<any[]>([])

// 监听插槽变化 (解决卡死问题的核心)
const onSlotAdd = (evt: any, slotRef: any) => {
  nextTick(() => {
    if (slotRef.value.length > 1) {
      const newItem = slotRef.value[evt.newIndex]
      const oldItems = slotRef.value.filter((i: any) => i !== newItem)
      slotRef.value = [newItem]
      oldItems.forEach((item: any) => {
        const exists = poolList.value.some(p => p.key === item.key)
        if (!exists) poolList.value.push(item)
      })
    }
  })
}

// 初始化布局
watch(() => props.show, async (val) => {
  if (val && props.category) {
    try {
      const rule = await window.api.getCategoryRule(props.category)
      form.value = { 
        layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' },
        ...rule 
      }
      
      let layout = form.value.layout
      if (Array.isArray(layout)) {
        layout = {
          topLeft: layout[0] || 'value',
          topRight: 'package',
          bottomLeft: layout[1] || 'name',
          bottomRight: 'location'
        }
      }

      const usedKeys = new Set([layout.topLeft, layout.topRight, layout.bottomLeft, layout.bottomRight])
      
      slotTopLeft.value = ALL_FIELDS.value.filter(f => f.key === layout.topLeft)
      slotTopRight.value = ALL_FIELDS.value.filter(f => f.key === layout.topRight)
      slotBottomLeft.value = ALL_FIELDS.value.filter(f => f.key === layout.bottomLeft)
      slotBottomRight.value = ALL_FIELDS.value.filter(f => f.key === layout.bottomRight)

      poolList.value = ALL_FIELDS.value.filter(f => !usedKeys.has(f.key))

    } catch (e) {
      console.error(e)
      message.error(t('categoryRule.messages.loadFailed'))
    }
  }
})

const handleSave = async () => {
  const newLayout = {
    topLeft: slotTopLeft.value[0]?.key || '',
    topRight: slotTopRight.value[0]?.key || '',
    bottomLeft: slotBottomLeft.value[0]?.key || '',
    bottomRight: slotBottomRight.value[0]?.key || ''
  }

  if (!newLayout.topLeft && !newLayout.bottomLeft && !newLayout.topRight && !newLayout.bottomRight) {
    message.warning(t('categoryRule.messages.layoutEmpty'))
    return
  }

  form.value.layout = newLayout
  const payload = JSON.parse(JSON.stringify(form.value))
  
  try {
    await window.api.saveCategoryRule(props.category, payload)
    message.success(t('categoryRule.messages.updated', { category: props.category }))
    emit('update:show', false)
    emit('refresh')
  } catch (e: any) {
    message.error(`${t('common.save')}${t('messages.error.failed')}: ${e.message}`)
  }
}

const handleReset = async () => {
  try {
    await window.api.resetCategoryRule(props.category)
    message.success(t('categoryRule.messages.resetSuccess'))
    emit('update:show', false)
    emit('refresh')
  } catch (e) { message.error(t('categoryRule.messages.resetFailed')) }
}

const getFieldLabel = (key: string) => {
  const def = ALL_FIELDS.value.find(f => f.key === key)
  return def ? def.label : ''
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card 
      :title="`${t('categoryRule.title')}: ${category}`" 
      class="rule-modal" 
      :bordered="false" 
      role="dialog" 
      aria-modal="true"
    >
      
      <div class="layout-editor">
        
        <div class="field-pool">
          <div class="pool-header">
            <span class="pool-title">{{ t('categoryRule.availableFields') }}</span>
            <span class="pool-hint">{{ t('categoryRule.dragHint') }}</span>
          </div>
          <VueDraggable
            v-model="poolList"
            :group="{ name: 'fields', put: true }" 
            :animation="200"
            ghost-class="ghost-pool"
            class="pool-list"
          >
            <div v-for="item in poolList" :key="item.key" class="field-chip">
              <n-icon :component="item.icon" class="chip-icon"/>
              <span>{{ item.label }}</span>
            </div>
            <div v-if="poolList.length === 0" class="empty-msg">{{ t('categoryRule.allUsed') }}</div>
          </VueDraggable>
        </div>

        <div class="simulator-container">
          <div class="sim-header">{{ t('categoryRule.preview') }}</div>
          
          <div class="grid-card">
            
            <div class="grid-cell cell-tl">
              <VueDraggable
                v-model="slotTopLeft"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotTopLeft)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotTopLeft.length > 0" class="slotted-content primary">
                  {{ getFieldLabel(slotTopLeft[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.mainTitle') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-tr">
              <VueDraggable
                v-model="slotTopRight"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotTopRight)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotTopRight.length > 0" class="slotted-content tag">
                  {{ getFieldLabel(slotTopRight[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.tag') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-bl">
              <VueDraggable
                v-model="slotBottomLeft"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotBottomLeft)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotBottomLeft.length > 0" class="slotted-content secondary">
                  {{ getFieldLabel(slotBottomLeft[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.subTitle') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-br">
              <VueDraggable
                v-model="slotBottomRight"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotBottomRight)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotBottomRight.length > 0" class="slotted-content meta">
                  {{ getFieldLabel(slotBottomRight[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.note') }}</div>
              </VueDraggable>
            </div>

          </div>
        </div>
      </div>

      <n-divider />

      <n-form size="small" label-placement="left" label-width="80" class="main-form">
        <n-divider title-placement="left">{{ t('categoryRule.rename.title') }}</n-divider>
        <div class="form-grid">
          <n-form-item :label="t('categoryRule.rename.valueLabel')">
            <n-input v-model:value="form.valueLabel" :placeholder="t('categoryRule.rename.valuePlaceholder')" />
          </n-form-item>
          <n-form-item :label="t('categoryRule.rename.nameLabel')">
            <n-input v-model:value="form.nameLabel" :placeholder="t('categoryRule.rename.namePlaceholder')" />
          </n-form-item>
          <n-form-item :label="t('categoryRule.rename.packageLabel')">
            <n-input v-model:value="form.packageLabel" :placeholder="t('categoryRule.rename.packagePlaceholder')" />
          </n-form-item>
        </div>
      </n-form>

      <template #footer>
        <div class="footer">
          <n-button type="warning" ghost @click="handleReset">↺ {{ t('categoryRule.reset') }}</n-button>
          
          <div class="right-btns">
            <n-button @click="emit('update:show', false)">{{ t('common.cancel') }}</n-button>
            <n-button type="primary" @click="handleSave">{{ t('categoryRule.apply') }}</n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
/* 样式保持不变 */
.rule-modal { 
  width: 620px; 
  background-color: var(--bg-modal); 
  border-radius: 16px; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.6);
  transition: background-color 0.3s ease;
}

.layout-editor {
  display: flex; gap: 20px; height: 220px;
}

.field-pool {
  width: 160px;
  background: var(--bg-sidebar);
  border-radius: 12px;
  padding: 12px;
  display: flex; flex-direction: column;
}
.pool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pool-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.pool-hint { font-size: 11px; color: var(--text-tertiary); }

.pool-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }


.field-chip {
  background: var(--bg-card); 
  border: 1px solid var(--border-main);
  padding: 8px 10px; border-radius: 8px;
  font-size: 12px; color: var(--text-primary);
  display: flex; align-items: center; gap: 8px;
  cursor: grab; user-select: none;
  transition: all 0.2s;
}
.field-chip:hover { border-color: var(--text-tertiary); background: var(--border-hover); }
.chip-icon { font-size: 14px; color: #0A84FF; }
.empty-msg { text-align: center; color: var(--text-tertiary); font-size: 12px; margin-top: 20px; }

.simulator-container { flex: 1; display: flex; flex-direction: column; }
.sim-header { font-size: 13px; color: var(--text-tertiary); margin-bottom: 10px; text-align: center; }

.grid-card {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  border-radius: 16px;
  padding: 16px;
  
  display: grid;
  grid-template-columns: 1fr 100px;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
}

.grid-cell {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: transparent;
  border: 1px dashed var(--border-main);
  transition: border-color 0.2s;
}
.grid-cell:hover { border-color: #0A84FF; }

.drop-area { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

.placeholder { font-size: 11px; color: var(--text-tertiary); pointer-events: none; user-select: none; }


.slotted-content {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; 
  cursor: grab;
}

.slotted-content.primary { 
  font-weight: bold; font-size: 15px; 
  background: #0A84FF; color: #fff; 
}

.slotted-content.secondary { 
  background: rgba(10, 132, 255, 0.15); 
  color: #007AFF; 
}

.slotted-content.tag { 
  background: var(--border-main); 
  color: var(--text-secondary); 
  border-radius: 4px; margin: 4px; height: auto; padding: 4px 0; 
}

.slotted-content.meta { 
  background: transparent; 
  color: var(--text-tertiary); 
  border: 1px solid var(--border-main); 
}

.ghost-pool { opacity: 0.4; background: #0A84FF; border: 1px dashed #fff; }
.ghost-slot { opacity: 0.5; background: #0A84FF; border-radius: 8px; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

:deep(.n-divider__title) { color: var(--text-tertiary); font-size: 12px; }

:deep(.n-form-item-label) { color: var(--text-secondary) !important; }

.footer { display: flex; justify-content: space-between; margin-top: 16px; }
.right-btns { display: flex; gap: 10px; }
</style>