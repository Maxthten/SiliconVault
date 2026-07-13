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
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
import { useI18n } from '../utils/i18n' // 引入国际化
import { invalidateCategoryRules, loadCategoryRules } from '../utils/category-rules'
import { getCategoryRule } from '../utils/category'
import {
  DEFAULT_CATEGORY_LAYOUT,
  type CategoryFieldKey,
  type CategoryLayout,
  type CategoryLayoutSlot,
  type CategoryLayoutTarget,
  getAvailableCategoryFields,
  isCategoryFieldKey,
  moveCategoryLayoutField,
  normalizeCategoryLayout,
  serializeCategoryLayout,
  validateCategoryLayout
} from '../utils/category-layout'

const props = defineProps<{
  show: boolean
  category: string
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()
const { t } = useI18n()

interface FieldDefinition {
  key: CategoryFieldKey
  label: string
  icon: typeof TextOutline
}

interface RuleForm {
  nameLabel: string
  namePlaceholder: string
  valueLabel: string
  valuePlaceholder: string
  packageLabel: string
  layout: CategoryLayout
}

const ALL_FIELDS = computed<FieldDefinition[]>(() => [
  { key: 'value', label: t('categoryRule.fields.value'), icon: TextOutline },
  { key: 'name', label: t('categoryRule.fields.name'), icon: HardwareChipOutline },
  { key: 'package', label: t('categoryRule.fields.package'), icon: CubeOutline },
  { key: 'location', label: t('categoryRule.fields.location'), icon: LocationOutline }
])

// 表单数据
const form = ref<RuleForm>({
  nameLabel: '', namePlaceholder: '',
  valueLabel: '', valuePlaceholder: '',
  packageLabel: '',
  layout: { ...DEFAULT_CATEGORY_LAYOUT }
})

const layout = ref<CategoryLayout>({ ...DEFAULT_CATEGORY_LAYOUT })
const poolList = ref<FieldDefinition[]>([])
const slotTopLeft = ref<FieldDefinition[]>([])
const slotTopRight = ref<FieldDefinition[]>([])
const slotBottomLeft = ref<FieldDefinition[]>([])
const slotBottomRight = ref<FieldDefinition[]>([])
const selectedField = ref<{
  field: CategoryFieldKey
  source: CategoryLayoutTarget
} | null>(null)

const slotLists: Record<CategoryLayoutSlot, typeof slotTopLeft> = {
  topLeft: slotTopLeft,
  topRight: slotTopRight,
  bottomLeft: slotBottomLeft,
  bottomRight: slotBottomRight
}

let dragContext: {
  field: CategoryFieldKey
  source: CategoryLayoutTarget
  snapshot: CategoryLayout
} | null = null

const getFieldDefinition = (key: CategoryFieldKey | null): FieldDefinition[] => {
  if (!key) return []
  const field = ALL_FIELDS.value.find((candidate) => candidate.key === key)
  return field ? [field] : []
}

const syncDragLists = (): void => {
  for (const [slot, list] of Object.entries(slotLists) as Array<
    [CategoryLayoutSlot, typeof slotTopLeft]
  >) {
    list.value = getFieldDefinition(layout.value[slot])
  }

  const available = new Set(getAvailableCategoryFields(layout.value))
  poolList.value = ALL_FIELDS.value.filter((field) => available.has(field.key))
}

const scheduleDragListSync = (): void => {
  nextTick(syncDragLists)
}

const getEventField = (event: DraggableEvent<FieldDefinition>): CategoryFieldKey | null => {
  const candidate = event.data?.key ?? event.clonedData?.key ?? event.item.dataset.fieldKey
  return isCategoryFieldKey(candidate) ? candidate : null
}

const handleDragStart = (
  source: CategoryLayoutTarget,
  event: DraggableEvent<FieldDefinition>
): void => {
  const field = getEventField(event)
  if (!field) return
  selectedField.value = null
  dragContext = {
    field,
    source,
    snapshot: { ...layout.value }
  }
}

const handleDrop = (
  target: CategoryLayoutTarget,
  event: DraggableEvent<FieldDefinition>
): void => {
  const field = dragContext?.field ?? getEventField(event)
  if (!field) {
    scheduleDragListSync()
    return
  }

  const source = dragContext?.source ?? 'pool'
  const snapshot = dragContext?.snapshot ?? { ...layout.value }
  layout.value = moveCategoryLayoutField(snapshot, field, source, target)
  scheduleDragListSync()
}

const handleDragEnd = (): void => {
  dragContext = null
  scheduleDragListSync()
}

const selectField = (field: CategoryFieldKey, source: CategoryLayoutTarget): void => {
  if (selectedField.value?.field === field && selectedField.value.source === source) {
    selectedField.value = null
    return
  }
  selectedField.value = { field, source }
}

const activateSlot = (target: CategoryLayoutSlot): void => {
  if (selectedField.value) {
    layout.value = moveCategoryLayoutField(
      layout.value,
      selectedField.value.field,
      selectedField.value.source,
      target
    )
    selectedField.value = null
    syncDragLists()
    return
  }

  const field = layout.value[target]
  if (field) selectField(field, target)
}

const returnSelectedFieldToPool = (): void => {
  if (!selectedField.value) return
  layout.value = moveCategoryLayoutField(
    layout.value,
    selectedField.value.field,
    selectedField.value.source,
    'pool'
  )
  selectedField.value = null
  syncDragLists()
}

// 初始化布局
watch(
  () => props.show,
  async (val) => {
    if (val && props.category) {
      try {
        const rule = getCategoryRule(await loadCategoryRules(), props.category)
        if (!rule) throw new Error('Category rule not found')
        const normalizedLayout = normalizeCategoryLayout(rule.layout)
        form.value = {
          nameLabel: rule.nameLabel || '',
          namePlaceholder: rule.namePlaceholder || '',
          valueLabel: rule.valueLabel || '',
          valuePlaceholder: rule.valuePlaceholder || '',
          packageLabel: rule.packageLabel || '',
          layout: normalizedLayout
        }
        layout.value = normalizedLayout
        selectedField.value = null
        syncDragLists()
      } catch (e) {
        console.error(e)
        message.error(t('categoryRule.messages.loadFailed'))
      }
    }
  },
  { immediate: true }
)

const handleSave = async (): Promise<void> => {
  const layoutErrors = validateCategoryLayout(layout.value)
  if (layoutErrors.length > 0) {
    console.error('Invalid category layout:', layoutErrors)
    message.error(t('categoryRule.messages.loadFailed'))
    return
  }

  if (Object.values(layout.value).every((field) => field === null)) {
    message.warning(t('categoryRule.messages.layoutEmpty'))
    return
  }

  const payload = {
    ...form.value,
    layout: serializeCategoryLayout(layout.value)
  }
  
  try {
    await window.api.saveCategoryRule(props.category, payload)
    invalidateCategoryRules()
    message.success(t('categoryRule.messages.updated', { category: props.category }))
    emit('update:show', false)
    emit('refresh')
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    message.error(`${t('common.save')}${t('messages.error.failed')}: ${detail}`)
  }
}

const handleReset = async (): Promise<void> => {
  try {
    await window.api.resetCategoryRule(props.category)
    invalidateCategoryRules()
    message.success(t('categoryRule.messages.resetSuccess'))
    emit('update:show', false)
    emit('refresh')
  } catch {
    message.error(t('categoryRule.messages.resetFailed'))
  }
}

const getFieldLabel = (key: string): string => {
  const def = ALL_FIELDS.value.find((field) => field.key === key)
  return def ? def.label : ''
}

watch(ALL_FIELDS, syncDragLists)
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
          <div
            class="pool-header"
            :class="{ 'can-return': selectedField && selectedField.source !== 'pool' }"
            :tabindex="selectedField && selectedField.source !== 'pool' ? 0 : -1"
            :role="selectedField && selectedField.source !== 'pool' ? 'button' : undefined"
            :title="selectedField && selectedField.source !== 'pool' ? t('categoryRule.availableFields') : undefined"
            @click="returnSelectedFieldToPool"
            @keydown.enter.prevent="returnSelectedFieldToPool"
            @keydown.space.prevent="returnSelectedFieldToPool"
          >
            <span class="pool-title">{{ t('categoryRule.availableFields') }}</span>
            <span class="pool-hint">{{ t('categoryRule.dragHint') }}</span>
          </div>
          <VueDraggable
            v-model="poolList"
            :group="{ name: 'category-layout-fields', pull: 'clone', put: true }"
            :animation="200"
            :sort="false"
            :fallback-tolerance="4"
            :force-fallback="true"
            :fallback-on-body="true"
            fallback-class="field-drag-fallback"
            ghost-class="ghost-pool"
            class="pool-list"
            data-layout-target="pool"
            @start="(event) => handleDragStart('pool', event)"
            @add="(event) => handleDrop('pool', event)"
            @end="handleDragEnd"
          >
            <div
              v-for="item in poolList"
              :key="item.key"
              class="field-chip"
              :class="{ selected: selectedField?.field === item.key && selectedField.source === 'pool' }"
              :data-field-key="item.key"
              :title="item.label"
              role="button"
              tabindex="0"
              @click.stop="selectField(item.key, 'pool')"
              @keydown.enter.prevent="selectField(item.key, 'pool')"
              @keydown.space.prevent="selectField(item.key, 'pool')"
            >
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
                :group="{ name: 'category-layout-fields', pull: true, put: true }"
                :sort="false"
                :fallback-tolerance="4"
                :force-fallback="true"
                :fallback-on-body="true"
                fallback-class="field-drag-fallback"
                @start="(event) => handleDragStart('topLeft', event)"
                @add="(event) => handleDrop('topLeft', event)"
                @end="handleDragEnd"
                class="drop-area"
                ghost-class="ghost-slot"
                data-layout-target="topLeft"
                role="button"
                tabindex="0"
                @click="activateSlot('topLeft')"
                @keydown.enter.prevent="activateSlot('topLeft')"
                @keydown.space.prevent="activateSlot('topLeft')"
              >
                <div
                  v-if="slotTopLeft.length > 0"
                  class="slotted-content primary"
                  :class="{ selected: selectedField?.field === slotTopLeft[0].key && selectedField.source === 'topLeft' }"
                  :data-field-key="slotTopLeft[0].key"
                  :title="getFieldLabel(slotTopLeft[0].key)"
                >
                  {{ getFieldLabel(slotTopLeft[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.mainTitle') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-tr">
              <VueDraggable
                v-model="slotTopRight"
                :group="{ name: 'category-layout-fields', pull: true, put: true }"
                :sort="false"
                :fallback-tolerance="4"
                :force-fallback="true"
                :fallback-on-body="true"
                fallback-class="field-drag-fallback"
                @start="(event) => handleDragStart('topRight', event)"
                @add="(event) => handleDrop('topRight', event)"
                @end="handleDragEnd"
                class="drop-area"
                ghost-class="ghost-slot"
                data-layout-target="topRight"
                role="button"
                tabindex="0"
                @click="activateSlot('topRight')"
                @keydown.enter.prevent="activateSlot('topRight')"
                @keydown.space.prevent="activateSlot('topRight')"
              >
                <div
                  v-if="slotTopRight.length > 0"
                  class="slotted-content tag"
                  :class="{ selected: selectedField?.field === slotTopRight[0].key && selectedField.source === 'topRight' }"
                  :data-field-key="slotTopRight[0].key"
                  :title="getFieldLabel(slotTopRight[0].key)"
                >
                  {{ getFieldLabel(slotTopRight[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.tag') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-bl">
              <VueDraggable
                v-model="slotBottomLeft"
                :group="{ name: 'category-layout-fields', pull: true, put: true }"
                :sort="false"
                :fallback-tolerance="4"
                :force-fallback="true"
                :fallback-on-body="true"
                fallback-class="field-drag-fallback"
                @start="(event) => handleDragStart('bottomLeft', event)"
                @add="(event) => handleDrop('bottomLeft', event)"
                @end="handleDragEnd"
                class="drop-area"
                ghost-class="ghost-slot"
                data-layout-target="bottomLeft"
                role="button"
                tabindex="0"
                @click="activateSlot('bottomLeft')"
                @keydown.enter.prevent="activateSlot('bottomLeft')"
                @keydown.space.prevent="activateSlot('bottomLeft')"
              >
                <div
                  v-if="slotBottomLeft.length > 0"
                  class="slotted-content secondary"
                  :class="{ selected: selectedField?.field === slotBottomLeft[0].key && selectedField.source === 'bottomLeft' }"
                  :data-field-key="slotBottomLeft[0].key"
                  :title="getFieldLabel(slotBottomLeft[0].key)"
                >
                  {{ getFieldLabel(slotBottomLeft[0].key) }}
                </div>
                <div v-else class="placeholder">{{ t('categoryRule.slots.subTitle') }}</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-br">
              <VueDraggable
                v-model="slotBottomRight"
                :group="{ name: 'category-layout-fields', pull: true, put: true }"
                :sort="false"
                :fallback-tolerance="4"
                :force-fallback="true"
                :fallback-on-body="true"
                fallback-class="field-drag-fallback"
                @start="(event) => handleDragStart('bottomRight', event)"
                @add="(event) => handleDrop('bottomRight', event)"
                @end="handleDragEnd"
                class="drop-area"
                ghost-class="ghost-slot"
                data-layout-target="bottomRight"
                role="button"
                tabindex="0"
                @click="activateSlot('bottomRight')"
                @keydown.enter.prevent="activateSlot('bottomRight')"
                @keydown.space.prevent="activateSlot('bottomRight')"
              >
                <div
                  v-if="slotBottomRight.length > 0"
                  class="slotted-content meta"
                  :class="{ selected: selectedField?.field === slotBottomRight[0].key && selectedField.source === 'bottomRight' }"
                  :data-field-key="slotBottomRight[0].key"
                  :title="getFieldLabel(slotBottomRight[0].key)"
                >
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
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  background-color: var(--bg-modal); 
  border-radius: 16px; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.6);
  transition: background-color 0.3s ease;
  overflow: hidden;
}

.layout-editor {
  display: flex; gap: 20px; min-height: 220px;
}

.field-pool {
  width: 160px;
  background: var(--bg-sidebar);
  border-radius: 12px;
  padding: 12px;
  display: flex; flex-direction: column;
}
.pool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pool-header.can-return {
  margin: -4px -4px 10px;
  padding: 4px;
  border-radius: 7px;
  cursor: pointer;
  outline: 1px dashed rgba(10, 132, 255, 0.55);
  background: rgba(10, 132, 255, 0.08);
}
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
.field-chip.selected {
  border-color: #0A84FF;
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.18);
}
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
:global(.field-drag-fallback) {
  opacity: 0.92 !important;
  border-radius: 8px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
  cursor: grabbing !important;
}

.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

:deep(.n-divider__title) { color: var(--text-tertiary); font-size: 12px; }

:deep(.n-form-item-label) { color: var(--text-secondary) !important; }

.footer { display: flex; justify-content: space-between; margin-top: 16px; }
.right-btns { display: flex; gap: 10px; }

:deep(.n-card__content) {
  overflow-y: auto;
  min-height: 0;
}
.slotted-content.selected {
  outline: 2px solid #fff;
  outline-offset: -4px;
  box-shadow: inset 0 0 0 5px rgba(10, 132, 255, 0.32);
}

.drop-area:focus-visible {
  outline: 2px solid #0A84FF;
  outline-offset: -2px;
}

@media (max-width: 680px), (max-height: 650px) {
  .rule-modal {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }

  .layout-editor {
    flex-direction: column;
    min-height: 0;
  }

  .field-pool {
    width: auto;
    min-height: 92px;
  }

  .pool-list {
    flex-direction: row;
    flex-wrap: wrap;
    overflow-y: visible;
  }

  .field-chip {
    flex: 1 1 120px;
  }

  .simulator-container {
    min-height: 220px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 460px) {
  .grid-card {
    grid-template-columns: minmax(0, 1fr) 86px;
    padding: 10px;
    gap: 8px;
  }

  .footer {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .right-btns {
    justify-content: flex-end;
  }
}
</style>
