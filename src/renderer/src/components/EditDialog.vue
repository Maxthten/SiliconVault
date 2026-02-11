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
  NModal, NCard, NInput, NInputNumber, NSelect, NButton, NForm, NFormItemRow, 
  NIcon, NTooltip, useMessage, NSpin
} from 'naive-ui'
import { 
  SettingsOutline, FlashOutline, AlertCircleOutline, 
  CloseCircle, CloudUploadOutline, DocumentTextOutline 
} from '@vicons/ionicons5'
import CategoryRuleModal from './CategoryRuleModal.vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from '../utils/i18n' 

const props = defineProps<{
  show: boolean
  editData?: any | null
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()
const { t } = useI18n()

// 定义老数据(中文)到新标准(英文Key)的映射表
// 用于兼容存量数据，防止出现“电阻”和“Resistor”并存的情况
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

const form = ref({
  id: undefined as number | undefined,
  category: 'Resistor',
  name: '', 
  value: '', 
  package: '', 
  quantity: 0, 
  location: '',
  min_stock: 10,
  image_paths: [] as string[],
  datasheet_paths: [] as string[]
})

const categoryOptions = ref<{ label: string, value: string }[]>([])
const title = computed(() => props.editData ? t('editDialog.titleEdit') : t('editDialog.titleAdd'))
const isUploading = ref(false)
const isDragOver = ref(false)

const currentRule = ref({
  nameLabel: 'Name/Model', namePlaceholder: 'Required',
  valueLabel: 'Value/Param', valuePlaceholder: 'Optional',
  packageLabel: 'Package'
})
const showRuleModal = ref(false)
const autoFormat = ref(true)

const FORMAT_CATS = ['电阻', 'Resistor', '电容', 'Capacitor', '电感', 'Inductor']

// --- 动态获取显示的 Label 和 Placeholder ---

const getLabel = (field: 'nameLabel' | 'valueLabel' | 'packageLabel') => {
  const cat = form.value.category
  // 核心：将可能的中文旧分类映射为英文 Key，以便去查语言包
  const ruleKey = LEGACY_MAP[cat] || cat
  
  const key = `fieldRules.${ruleKey}.${field}`
  const text = t(key)
  if (text !== key) return text

  const genKey = `fieldRules.General.${field}`
  const genText = t(genKey)
  if (genText !== genKey) return genText

  return currentRule.value[field]
}

const getPlaceholder = (field: 'namePlaceholder' | 'valuePlaceholder') => {
  const cat = form.value.category
  const ruleKey = LEGACY_MAP[cat] || cat

  const key = `fieldRules.${ruleKey}.${field}`
  const text = t(key)
  if (text !== key) return text
  
  const genKey = `fieldRules.General.${field}`
  const genText = t(genKey)
  if (genText !== genKey) return genText

  return currentRule.value[field]
}

// --- 文件上传处理 ---

const triggerFileInput = () => {
  document.getElementById('hidden-file-input')?.click()
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    await processFileList(input.files)
  }
  input.value = '' 
}

const handleDragOver = () => { isDragOver.value = true }
const handleDragLeave = () => { isDragOver.value = false }
const handleDrop = async (e: DragEvent) => {
  isDragOver.value = false
  if (e.dataTransfer?.files) {
    await processFileList(e.dataTransfer.files)
  }
}

const handlePaste = async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  const files: File[] = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length > 0) await processFiles(files)
}

const processFileList = async (fileList: FileList) => {
  const files: File[] = []
  for (let i = 0; i < fileList.length; i++) files.push(fileList[i])
  await processFiles(files)
}

const processFiles = async (files: File[]) => {
  if (isUploading.value) return
  isUploading.value = true
  
  let successCount = 0
  const group = 'inventory' 
  const category = form.value.category || 'uncategorized' 

  try {
    for (const file of files) {
      let newFilename = ''
      const sourcePath = (file as any).path

      if (sourcePath) {
        newFilename = await window.api.saveAsset(sourcePath, group, category)
      } else {
        const arrayBuffer = await file.arrayBuffer()
        newFilename = await window.api.saveBuffer(arrayBuffer, file.name || 'screenshot.png', group, category)
      }

      const lowerName = newFilename.toLowerCase()
      if (lowerName.endsWith('.pdf')) {
        form.value.datasheet_paths.push(newFilename)
      } else {
        form.value.image_paths.push(newFilename)
      }
      successCount++
    }

    if (successCount > 0) {
      message.success(t('editDialog.upload.success', { count: successCount }))
    } else {
      message.warning(t('editDialog.upload.noValidFile'))
    }

  } catch (e) {
    console.error(e)
    message.error(t('editDialog.upload.failed'))
  } finally {
    isUploading.value = false
  }
}

const removeImage = (index: number) => form.value.image_paths.splice(index, 1)
const removeDoc = (index: number) => form.value.datasheet_paths.splice(index, 1)

// --- 业务逻辑 ---

const formatElectronicValue = (val: string, cat: string) => {
  if (!val) return val
  let res = val.trim()
  const shiftRegex = /^(\d+)([kKmMuUnNpPrR])(\d+)$/
  const match = res.match(shiftRegex)
  if (match) res = `${match[1]}.${match[3]}${match[2]}`
  res = res.replace(/K/g, 'k').replace(/P/g, 'p').replace(/N/g, 'n').replace(/[uU]/g, 'µ')
  
  if (['电阻', 'Resistor', '保险丝', 'Fuse'].includes(cat)) {
    res = res.replace(/(r|ohm|Ω)$/i, 'R')
    if (/[\dkmM]$/.test(res)) res += 'R'
  }
  if (['二极管', 'Diode'].includes(cat)) {
    res = res.replace(/(v|volt)$/i, 'V')
    if (/[\d]$/.test(res)) res += 'V'
  }
  if (['电容', 'Capacitor'].includes(cat)) {
    res = res.replace(/f$/i, 'F')
    if (/[\dpnµm]$/.test(res)) res += 'F'
  }
  if (['电感', 'Inductor'].includes(cat)) {
    res = res.replace(/h$/i, 'H')
    if (/[\dnµm]$/.test(res)) res += 'H'
  }
  res = res.replace(/v$/i, 'V')
  return res
}

const handleValueBlur = () => {
  if (autoFormat.value && FORMAT_CATS.includes(form.value.category)) {
    const original = form.value.value
    const formatted = formatElectronicValue(original, form.value.category)
    if (original !== formatted) form.value.value = formatted
  }
}

const loadRule = async () => {
  if (form.value.category) {
    try {
      const rule = await window.api.getCategoryRule(form.value.category)
      currentRule.value = rule
    } catch (e) { console.error(e) }
  }
}

watch(() => props.show, async (newVal) => {
  if (newVal) {
    const cats = await window.api.fetchCategories()
    
    // 智能去重与映射逻辑
    const mergedMap = new Map<string, { label: string, value: string }>()

    cats.forEach((rawCat: string) => {
      // 1. 找到对应的“标准英文Key”
      const canonicalKey = LEGACY_MAP[rawCat] || rawCat

      // 2. 获取显示名称 (尝试翻译)
      const transKey = `categories.${canonicalKey}`
      const translated = t(transKey)
      const displayLabel = translated !== transKey ? translated : rawCat

      // 3. 智能合并策略
      if (mergedMap.has(displayLabel)) {
        // 如果当前是“老数据格式”（即它在 LEGACY_MAP 里作为 Key 存在，比如“电阻”）
        // 优先保留老数据格式作为 value，防止数据库分裂
        if (LEGACY_MAP[rawCat]) {
          mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
        }
      } else {
        mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
      }
    })

    categoryOptions.value = Array.from(mergedMap.values())
    
    if (props.editData) {
      let imgs = props.editData.image_paths
      let docs = props.editData.datasheet_paths
      try {
        if (typeof imgs === 'string') imgs = JSON.parse(imgs)
        if (typeof docs === 'string') docs = JSON.parse(docs)
      } catch(e) { imgs = []; docs = [] }

      form.value = { 
        ...props.editData,
        min_stock: props.editData.min_stock ?? 10,
        image_paths: Array.isArray(imgs) ? imgs : [],
        datasheet_paths: Array.isArray(docs) ? docs : []
      }
    } else {
      // 计算默认分类
      let defaultCat = 'Resistor'
      // 尝试在生成的选项中找到 Resistor 对应的真实 Value (可能是 '电阻')
      const resistorLabel = t('categories.Resistor')
      const targetOpt = categoryOptions.value.find(o => o.label === resistorLabel)
      if (targetOpt) defaultCat = targetOpt.value

      form.value = {
        id: undefined, 
        category: defaultCat, 
        name: '', value: '', package: '', quantity: 0, location: '', min_stock: 10,
        image_paths: [], datasheet_paths: []
      }
    }
    loadRule()
  }
})

watch(() => form.value.category, () => { loadRule() })

const handleSave = async () => {
  handleValueBlur()
  if (!form.value.name && !form.value.value) { 
    message.warning(t('editDialog.validation.required'))
    return 
  }
  
  const payload = {
    ...form.value,
    quantity: Number(form.value.quantity),
    image_paths: JSON.stringify(form.value.image_paths),
    datasheet_paths: JSON.stringify(form.value.datasheet_paths)
  }

  await window.api.upsertItem(payload)
  message.success(t('messages.success.saved'))
  emit('update:show', false)
  emit('refresh')
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" class="ios-modal-card" :bordered="false" size="huge" role="dialog" aria-modal="true">
      
      <div class="upload-container">
        <input 
          type="file" 
          id="hidden-file-input" 
          multiple 
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf" 
          style="display: none" 
          @change="handleFileSelect"
        >

        <div 
          class="drop-zone"
          :class="{ 'is-dragover': isDragOver }"
          tabindex="0"
          @click="triggerFileInput"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
          @paste="handlePaste"
        >
          <div class="zone-content">
            <n-icon size="32" :component="CloudUploadOutline" class="upload-icon" />
            <div class="hint-main">{{ t('editDialog.upload.hintMain') }}</div>
            <div class="hint-sub">{{ t('editDialog.upload.hintSub') }}</div>
          </div>
          <n-spin v-if="isUploading" class="upload-spin" />
        </div>

        <div class="media-preview-list" v-if="form.image_paths.length > 0 || form.datasheet_paths.length > 0">
          
          <VueDraggable v-model="form.image_paths" class="img-grid" :animation="200">
            <div 
              v-for="(path, index) in form.image_paths" 
              :key="path" 
              class="media-item img-item"
            >
              <img :src="'local-resource://' + path" class="thumb-img" />
              <div class="remove-btn" @click.stop="removeImage(index)">
                <n-icon :component="CloseCircle" />
              </div>
              <div v-if="index === 0" class="cover-tag">{{ t('editDialog.upload.cover') }}</div>
            </div>
          </VueDraggable>

          <div class="doc-list" v-if="form.datasheet_paths.length > 0">
            <div v-for="(path, index) in form.datasheet_paths" :key="path" class="media-item doc-item">
              <n-icon :component="DocumentTextOutline" color="#ff4d4f" size="20" />
              <span class="doc-name">{{ path.split('/').pop()?.replace(/^\d+_/, '') || t('editDialog.upload.document') }}</span>
              <div class="remove-btn doc-remove" @click.stop="removeDoc(index)">
                <n-icon :component="CloseCircle" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <n-form class="main-form">
        <n-form-item-row :label="t('inventory.category')">
          <div class="cat-row">
            <n-select
              v-model:value="form.category"
              filterable tag
              :placeholder="t('editDialog.categoryPlaceholder')"
              :options="categoryOptions"
              class="cat-select"
            />
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button circle secondary @click="showRuleModal = true">
                  <template #icon><n-icon :component="SettingsOutline" /></template>
                </n-button>
              </template>
              {{ t('editDialog.fieldSettings') }}
            </n-tooltip>
          </div>
        </n-form-item-row>

        <div class="row-2">
          <n-form-item-row class="custom-label-row">
            <template #label>
              <div class="label-container">
                <span class="label-text">{{ getLabel('valueLabel') }}</span>
                <div 
                  v-if="FORMAT_CATS.includes(form.category)" 
                  class="smart-tag" 
                  :class="{ active: autoFormat }"
                  @click="autoFormat = !autoFormat"
                >
                  <n-icon :component="FlashOutline" class="tag-icon" />
                  <span class="tag-text">{{ t('editDialog.standardize') }}</span>
                </div>
              </div>
            </template>
            <n-input 
              v-model:value="form.value" 
              :placeholder="getPlaceholder('valuePlaceholder')" 
              @blur="handleValueBlur"
            />
          </n-form-item-row>

          <n-form-item-row :label="getLabel('nameLabel')">
            <n-input v-model:value="form.name" :placeholder="getPlaceholder('namePlaceholder')" />
          </n-form-item-row>
        </div>

        <div class="row-2">
          <n-form-item-row :label="getLabel('packageLabel')">
            <n-input v-model:value="form.package" :placeholder="t('editDialog.optional')" />
          </n-form-item-row>
          <n-form-item-row :label="t('editDialog.location')">
            <n-input v-model:value="form.location" :placeholder="t('editDialog.locationPlaceholder')" />
          </n-form-item-row>
        </div>

        <div class="row-2">
          <n-form-item-row :label="t('editDialog.quantity')">
            <n-input-number 
              v-model:value="form.quantity" 
              :min="0" 
              button-placement="both" 
              class="full-width" 
            />
          </n-form-item-row>

          <n-form-item-row :label="t('editDialog.minStock')">
            <n-input-number 
              v-model:value="form.min_stock" 
              :min="0" 
              class="full-width"
              :placeholder="t('editDialog.default10')"
            >
              <template #prefix>
                <n-icon :component="AlertCircleOutline" color="#f2c97d" />
              </template>
            </n-input-number>
          </n-form-item-row>
        </div>
      </n-form>

      <template #footer>
        <div class="footer-btns">
          <n-button class="btn-cancel" @click="emit('update:show', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" class="btn-save" @click="handleSave" :loading="isUploading">
            {{ editData ? t('common.save') : t('common.add') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
  
  <CategoryRuleModal 
    v-model:show="showRuleModal" 
    :category="form.category"
    @refresh="loadRule" 
  />
</template>

<style scoped>
/* 样式保持不变 */
.ios-modal-card { 
  width: 500px; 
  background-color: var(--bg-modal); 
  border-radius: 16px; 
  box-shadow: 0 20px 40px rgba(0,0,0,0.4); 
  transition: background-color 0.3s ease, color 0.3s ease;
}

:global([data-theme="light"]) .ios-modal-card {
  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
}

.upload-container {
  margin-bottom: 24px;
}

.drop-zone {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 24px 0;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

:global([data-theme="light"]) .drop-zone {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
}

.drop-zone:hover, .drop-zone:focus {
  border-color: #0A84FF;
  background: rgba(10, 132, 255, 0.05);
}

.drop-zone.is-dragover {
  border-color: #30D158;
  background: rgba(48, 209, 88, 0.1);
  transform: scale(0.99);
}

.zone-content { pointer-events: none; }
.upload-icon { 
  color: var(--text-tertiary); 
  margin-bottom: 8px; transition: color 0.2s; 
}
.drop-zone:hover .upload-icon { color: #0A84FF; }

.hint-main { 
  font-size: 14px; 
  color: var(--text-primary); 
  font-weight: 500; margin-bottom: 4px; 
}
.hint-sub { 
  font-size: 12px; 
  color: var(--text-tertiary); 
}

.upload-spin {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
}

.media-preview-list { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }

.img-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.img-item {
  width: 70px; height: 70px; 
  position: relative;
  border-radius: 8px; overflow: hidden;
  border: 1px solid var(--border-main); 
  background: #000; 
  cursor: grab;
}
.img-item:active { cursor: grabbing; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }

.cover-tag {
  position: absolute; bottom: 0; width: 100%;
  background: rgba(10, 132, 255, 0.8); color: white;
  font-size: 10px; text-align: center; padding: 2px 0;
  pointer-events: none;
}

.doc-list { display: flex; flex-direction: column; gap: 8px; }
.doc-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--border-main);
  padding: 8px 12px; border-radius: 8px;
  position: relative;
}
.doc-name { 
  font-size: 13px; 
  color: var(--text-primary); 
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; 
}

.remove-btn {
  position: absolute; top: 2px; right: 2px;
  width: 18px; height: 18px;
  background: rgba(0,0,0,0.6); border-radius: 50%;
  color: #fff; display: flex; justify-content: center; align-items: center;
  cursor: pointer; opacity: 0; transition: opacity 0.2s;
}
.img-item:hover .remove-btn { opacity: 1; }
.remove-btn:hover { background: #FF453A; }

.doc-remove { 
  position: static; opacity: 0.5; background: transparent; 
  color: var(--text-secondary); 
}
.doc-remove:hover { opacity: 1; background: transparent; color: #FF453A; }

:deep(.n-card-header__main) { 
  color: var(--text-primary) !important; 
  font-weight: 700; 
}
:deep(.n-form-item-label) { 
  color: var(--text-secondary) !important; 
}

.cat-row { display: flex; gap: 8px; width: 100%; }
.cat-select { flex: 1; }
.row-2 { display: flex; gap: 12px; }
.row-2 > div { flex: 1; }
.full-width { width: 100%; }
.footer-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }
.btn-save { padding: 0 24px; font-weight: 600; }
.label-container { display: flex; justify-content: space-between; align-items: center; width: 100%; }

.smart-tag {
  display: flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 6px; 
  background-color: var(--border-main); 
  color: var(--text-secondary);
  cursor: pointer; transition: all 0.3s; user-select: none; font-size: 11px; font-weight: bold;
}
.smart-tag.active { background-color: #63e2b7; color: #000; }
</style>