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

const props = defineProps<{
  show: boolean
  editData?: any | null
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()

// 表单数据定义
const form = ref({
  id: undefined as number | undefined,
  category: '电阻',
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
const title = computed(() => props.editData ? '修改元件' : '新元件入库')
const isUploading = ref(false)
const isDragOver = ref(false)

// 字段规则配置
const currentRule = ref({
  nameLabel: '型号/名称', namePlaceholder: '必填',
  valueLabel: '参数/数值', valuePlaceholder: '选填',
  packageLabel: '封装'
})
const showRuleModal = ref(false)
const autoFormat = ref(true)
const FORMAT_CATS = ['电阻', '电容', '电感']

// --- 文件上传处理 ---

// 触发隐藏的文件选择框
const triggerFileInput = () => {
  document.getElementById('hidden-file-input')?.click()
}

// 处理点击选择文件
const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    await processFileList(input.files)
  }
  input.value = '' 
}

// 处理拖拽事件
const handleDragOver = () => { isDragOver.value = true }
const handleDragLeave = () => { isDragOver.value = false }
const handleDrop = async (e: DragEvent) => {
  isDragOver.value = false
  if (e.dataTransfer?.files) {
    await processFileList(e.dataTransfer.files)
  }
}

// 处理粘贴事件 (Ctrl+V)
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

// 转换文件列表为数组并处理
const processFileList = async (fileList: FileList) => {
  const files: File[] = []
  for (let i = 0; i < fileList.length; i++) files.push(fileList[i])
  await processFiles(files)
}

// 核心文件上传逻辑
const processFiles = async (files: File[]) => {
  if (isUploading.value) return
  isUploading.value = true
  
  let successCount = 0
  const group = 'inventory' // 指定模块名称
  const category = form.value.category || 'uncategorized' // 获取当前分类

  try {
    for (const file of files) {
      let newFilename = ''
      
      // Electron 环境下 File 对象包含 path 属性
      const sourcePath = (file as any).path

      if (sourcePath) {
        // 方案 A: 有路径，直接复制文件
        // 传递 group 和 category 用于后端分类存储
        newFilename = await window.api.saveAsset(sourcePath, group, category)
      } else {
        // 方案 B: 无路径 (如截图)，传递二进制流
        const arrayBuffer = await file.arrayBuffer()
        newFilename = await window.api.saveBuffer(arrayBuffer, file.name || 'screenshot.png', group, category)
      }

      // 根据扩展名分类存入表单
      const lowerName = newFilename.toLowerCase()
      if (lowerName.endsWith('.pdf')) {
        form.value.datasheet_paths.push(newFilename)
      } else {
        form.value.image_paths.push(newFilename)
      }
      successCount++
    }

    if (successCount > 0) {
      message.success(`成功添加 ${successCount} 个文件`)
    } else {
      message.warning('未识别到有效文件')
    }

  } catch (e) {
    console.error(e)
    message.error('文件处理失败')
  } finally {
    isUploading.value = false
  }
}

// 移除文件
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
  if (cat === '电阻' || cat === '保险丝') {
    res = res.replace(/(r|ohm|Ω)$/i, 'R')
    if (/[\dkmM]$/.test(res)) res += 'R'
  }
  if (cat === '二极管') {
    res = res.replace(/(v|volt)$/i, 'V')
    if (/[\d]$/.test(res)) res += 'V'
  }
  if (cat === '电容') {
    res = res.replace(/f$/i, 'F')
    if (/[\dpnµm]$/.test(res)) res += 'F'
  }
  if (cat === '电感') {
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
    categoryOptions.value = cats.map(c => ({ label: c, value: c }))
    
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
      form.value = {
        id: undefined, category: form.value.category || '电阻', name: '', value: '', package: '', quantity: 0, location: '', min_stock: 10,
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
    message.warning('请至少填写核心参数或型号')
    return 
  }
  
  const payload = {
    ...form.value,
    quantity: Number(form.value.quantity),
    image_paths: JSON.stringify(form.value.image_paths),
    datasheet_paths: JSON.stringify(form.value.datasheet_paths)
  }

  await window.api.upsertItem(payload)
  message.success(props.editData ? '修改成功' : '入库成功')
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
            <div class="hint-main">点击、拖拽或粘贴 (Ctrl+V) 上传</div>
            <div class="hint-sub">支持图片 (JPG, PNG, WEBP) 和 PDF 文档</div>
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
              <div v-if="index === 0" class="cover-tag">封面</div>
            </div>
          </VueDraggable>

          <div class="doc-list" v-if="form.datasheet_paths.length > 0">
            <div v-for="(path, index) in form.datasheet_paths" :key="path" class="media-item doc-item">
              <n-icon :component="DocumentTextOutline" color="#ff4d4f" size="20" />
              <span class="doc-name">{{ path.split('/').pop()?.replace(/^\d+_/, '') || '文档' }}</span>
              <div class="remove-btn doc-remove" @click.stop="removeDoc(index)">
                <n-icon :component="CloseCircle" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <n-form class="main-form">
        <n-form-item-row label="分类">
          <div class="cat-row">
            <n-select
              v-model:value="form.category"
              filterable tag
              placeholder="选择或输入新增..."
              :options="categoryOptions"
              class="cat-select"
            />
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button circle secondary @click="showRuleModal = true">
                  <template #icon><n-icon :component="SettingsOutline" /></template>
                </n-button>
              </template>
              设置字段名称
            </n-tooltip>
          </div>
        </n-form-item-row>

        <div class="row-2">
          <n-form-item-row class="custom-label-row">
            <template #label>
              <div class="label-container">
                <span class="label-text">{{ currentRule.valueLabel }}</span>
                <div 
                  v-if="FORMAT_CATS.includes(form.category)" 
                  class="smart-tag" 
                  :class="{ active: autoFormat }"
                  @click="autoFormat = !autoFormat"
                >
                  <n-icon :component="FlashOutline" class="tag-icon" />
                  <span class="tag-text">标准化</span>
                </div>
              </div>
            </template>
            <n-input 
              v-model:value="form.value" 
              :placeholder="currentRule.valuePlaceholder" 
              @blur="handleValueBlur"
            />
          </n-form-item-row>

          <n-form-item-row :label="currentRule.nameLabel">
            <n-input v-model:value="form.name" :placeholder="currentRule.namePlaceholder" />
          </n-form-item-row>
        </div>

        <div class="row-2">
          <n-form-item-row :label="currentRule.packageLabel">
            <n-input v-model:value="form.package" placeholder="选填" />
          </n-form-item-row>
          <n-form-item-row label="存放位置">
            <n-input v-model:value="form.location" placeholder="例如：A01-3" />
          </n-form-item-row>
        </div>

        <div class="row-2">
          <n-form-item-row label="库存数量">
            <n-input-number 
              v-model:value="form.quantity" 
              :min="0" 
              button-placement="both" 
              class="full-width" 
            />
          </n-form-item-row>

          <n-form-item-row label="警戒库存">
            <n-input-number 
              v-model:value="form.min_stock" 
              :min="0" 
              class="full-width"
              placeholder="默认 10"
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
          <n-button class="btn-cancel" @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" class="btn-save" @click="handleSave" :loading="isUploading">
            {{ editData ? '保存' : '入库' }}
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
.ios-modal-card { 
  width: 500px; 
  background-color: #1c1c1e; 
  border-radius: 16px; 
  box-shadow: 0 20px 40px rgba(0,0,0,0.4); 
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
.upload-icon { color: #666; margin-bottom: 8px; transition: color 0.2s; }
.drop-zone:hover .upload-icon { color: #0A84FF; }
.hint-main { font-size: 14px; color: #ddd; font-weight: 500; margin-bottom: 4px; }
.hint-sub { font-size: 12px; color: #666; }

.upload-spin {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
}

.media-preview-list { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }

.img-grid { display: flex; gap: 10px; flex-wrap: wrap; }
.img-item {
  width: 70px; height: 70px; 
  position: relative;
  border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
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
  background: rgba(255,255,255,0.05);
  padding: 8px 12px; border-radius: 8px;
  position: relative;
}
.doc-name { font-size: 13px; color: #ddd; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.remove-btn {
  position: absolute; top: 2px; right: 2px;
  width: 18px; height: 18px;
  background: rgba(0,0,0,0.6); border-radius: 50%;
  color: #fff; display: flex; justify-content: center; align-items: center;
  cursor: pointer; opacity: 0; transition: opacity 0.2s;
}
.img-item:hover .remove-btn { opacity: 1; }
.remove-btn:hover { background: #FF453A; }

.doc-remove { position: static; opacity: 0.5; background: transparent; }
.doc-remove:hover { opacity: 1; background: transparent; color: #FF453A; }

:deep(.n-card-header__main) { color: white; font-weight: 700; }
:deep(.n-form-item-label) { color: #8e8e93 !important; }
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
  border-radius: 6px; background-color: rgba(255, 255, 255, 0.1); color: #888;
  cursor: pointer; transition: all 0.3s; user-select: none; font-size: 11px; font-weight: bold;
}
.smart-tag.active { background-color: #63e2b7; color: #000; }
</style>