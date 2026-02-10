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
import { ref, watch } from 'vue'
import { 
  NModal, NCard, NInput, NInputNumber, NButton, NIcon, NEmpty, NTag, NSelect, useMessage, NSpin
} from 'naive-ui'
import { 
  Search, Add, Remove, SaveOutline, ArrowForward, CloudUploadOutline, 
  DocumentTextOutline, CloseCircle, FolderOpenOutline 
} from '@vicons/ionicons5'
import { VueDraggable } from 'vue-draggable-plus'

const props = defineProps<{
  show: boolean
  projectData?: any
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()

// 表单信息
const form = ref({
  id: undefined as number | undefined,
  name: '',
  description: ''
})

const bomList = ref<any[]>([])
const fileList = ref<string[]>([]) 

// 状态控制
const isUploading = ref(false)
const isDragOver = ref(false)
const showUploadArea = ref(false)

// 左侧筛选状态
const sourceSearch = ref('')
const filterCategory = ref<string | null>(null)
const filterPackage = ref<string | null>(null)
const sourceList = ref<any[]>([])

// 选项列表
const categoryOptions = ref<any[]>([])
const packageOptions = ref<any[]>([])
// 存储分类规则
const categoryRules = ref<Record<string, any>>({})

// --- 初始化与加载 ---

const loadCategories = async () => {
  try {
    const cats = await window.api.fetchCategories()
    categoryOptions.value = [{ label: '全部分类', value: null }, ...cats.map(c => ({ label: c, value: c }))]
  } catch (e) { console.error(e) }
}

const loadPackages = async () => {
  try {
    const pkgs = await window.api.fetchPackages(filterCategory.value || undefined)
    packageOptions.value = [{ label: '全部封装', value: null }, ...pkgs.map(p => ({ label: p, value: p }))]
  } catch (e) { console.error(e) }
}

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

watch(() => props.show, async (val) => {
  if (val) {
    await loadCategories()
    await loadPackages()
    await loadRules()

    if (props.projectData) {
      form.value = { ...props.projectData }
      
      try {
        bomList.value = await window.api.getProjectDetail(props.projectData.id)
      } catch (e) { bomList.value = [] }

      try {
        const filesRaw = props.projectData.files
        fileList.value = filesRaw ? JSON.parse(filesRaw) : []
      } catch (e) { fileList.value = [] }

    } else {
      form.value = { id: undefined, name: '', description: '' }
      bomList.value = []
      fileList.value = []
    }
    
    sourceSearch.value = ''
    filterCategory.value = null
    filterPackage.value = null
    showUploadArea.value = false
    searchInventory()
  }
})

// --- 动态显示逻辑 ---

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

  return {
    tl: item[layout.tl] || '',
    tr: item[layout.tr] || '',
    trKey: layout.tr,
    bl: item[layout.bl] || ''
  }
}

// --- 库存搜索 ---

const searchInventory = async () => {
  try {
    const grouped = await window.api.fetchInventory({
      keyword: sourceSearch.value,
      category: filterCategory.value || undefined,
      package: filterPackage.value || undefined
    })
    const flat = [] as any[]
    for (const cat in grouped) {
      flat.push(...grouped[cat])
    }
    sourceList.value = flat
  } catch (e) { console.error(e) }
}

watch(filterCategory, () => {
  loadPackages()
  filterPackage.value = null
  searchInventory()
})

watch([sourceSearch, filterPackage], () => { searchInventory() })

// --- BOM 操作 ---

const addToBom = (item: any) => {
  const existing = bomList.value.find(b => b.inventory_id === item.id)
  if (existing) {
    existing.quantity += 1
  } else {
    bomList.value.push({
      inventory_id: item.id,
      quantity: 1,
      name: item.name,
      value: item.value,
      package: item.package,
      category: item.category 
    })
  }
}

const removeFromBom = (index: number) => {
  bomList.value.splice(index, 1)
}

// --- 附件上传逻辑 ---

const triggerFileInput = () => document.getElementById('bom-file-input')?.click()

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    await processFiles(Array.from(input.files))
  }
  input.value = '' 
}

const handleDrop = async (e: DragEvent) => {
  isDragOver.value = false
  if (e.dataTransfer?.files) {
    await processFiles(Array.from(e.dataTransfer.files))
  }
}

const processFiles = async (files: File[]) => {
  if (isUploading.value) return
  isUploading.value = true
  
  const projectCategory = form.value.name ? form.value.name.trim() : 'UnsavedProject'
  
  let count = 0
  try {
    for (const file of files) {
      const sourcePath = (file as any).path
      let savedPath = ''

      if (sourcePath) {
        savedPath = await window.api.saveAsset(sourcePath, 'bom', projectCategory)
      } else {
        const buffer = await file.arrayBuffer()
        savedPath = await window.api.saveBuffer(buffer, file.name, 'bom', projectCategory)
      }
      
      fileList.value.push(savedPath)
      count++
    }
    if (count > 0) message.success(`成功添加 ${count} 个附件`)
  } catch (e) {
    console.error(e)
    message.error('上传失败')
  } finally {
    isUploading.value = false
  }
}

const removeFile = (index: number) => fileList.value.splice(index, 1)

const handleFileClick = (path: string) => {
  const ext = path.toLowerCase().split('.').pop()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf'].includes(ext || '')) {
    window.api.openFile(path)
  } else {
    window.api.showItemInFolder(path)
  }
}

// --- 保存 ---

const handleSave = async () => {
  if (!form.value.name || !form.value.name.trim()) {
    message.warning('⚠️ 请输入项目名称')
    return
  }
  
  try {
    await window.api.saveProject({
      ...form.value,
      items: bomList.value.map(i => ({
        inventory_id: i.inventory_id,
        quantity: i.quantity
      })),
      files: JSON.stringify(fileList.value)
    })
    
    message.success('✅ 保存项目成功！')
    emit('update:show', false)
    emit('refresh')
  } catch (e) {
    message.error('保存失败: ' + String(e))
  }
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card class="bom-modal" :bordered="false" role="dialog" aria-modal="true">
      <template #header>
        <div class="modal-header">
          <span>{{ form.id ? '✏️ 编辑 BOM 项目' : '🚀 新建 PCB 项目' }}</span>
        </div>
      </template>

      <div class="editor-layout">
        
        <div class="meta-area">
          <div class="meta-left">
            <div class="input-group">
              <n-input v-model:value="form.name" placeholder="项目名称 (必填)" size="large" class="name-input" />
            </div>
            <div class="input-group">
              <n-input v-model:value="form.description" placeholder="项目备注 (选填)" />
            </div>
          </div>

          <div class="meta-right">
             <n-button secondary size="small" @click="showUploadArea = !showUploadArea">
               <template #icon>
                 <n-icon :component="showUploadArea ? FolderOpenOutline : CloudUploadOutline" />
               </template>
               {{ showUploadArea ? '收起附件' : `附件 (${fileList.length})` }}
             </n-button>
          </div>
        </div>

        <div v-show="showUploadArea" class="upload-panel">
          <input 
            type="file" 
            id="bom-file-input" 
            multiple 
            style="display: none" 
            @change="handleFileSelect"
          >
          
          <div 
            class="drop-zone"
            :class="{ 'is-dragover': isDragOver }"
            @click="triggerFileInput"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="handleDrop"
          >
            <div class="zone-content">
              <n-icon size="24" :component="CloudUploadOutline" />
              <span>拖拽原理图、PCB、压缩包到这里</span>
            </div>
            <n-spin v-if="isUploading" class="upload-spin" />
          </div>

          <div v-if="fileList.length > 0" class="file-grid">
            <VueDraggable v-model="fileList" class="file-grid-inner" :animation="200">
              <div v-for="(path, index) in fileList" :key="path" class="file-item" @click="handleFileClick(path)">
                <div class="file-icon">
                  <img 
                    v-if="['jpg','png','jpeg','webp'].some(e => path.toLowerCase().endsWith(e))" 
                    :src="'local-resource://' + path" 
                    class="thumb-img"
                  />
                  <n-icon v-else :component="DocumentTextOutline" />
                </div>
                
                <div class="file-name" :title="path">{{ path.split('/').pop()?.replace(/^\d+_/, '') }}</div>
                
                <div class="remove-btn" @click.stop="removeFile(index)">
                  <n-icon :component="CloseCircle" />
                </div>
              </div>
            </VueDraggable>
          </div>
        </div>

        <div class="split-area">
          <div class="panel left-panel">
            <div class="panel-header-group">
              <div class="filter-row">
                <n-select v-model:value="filterCategory" :options="categoryOptions" placeholder="分类" size="tiny" class="mini-select" />
                <n-select v-model:value="filterPackage" :options="packageOptions" placeholder="封装" size="tiny" class="mini-select" />
              </div>
              <div class="search-row">
                <n-input round placeholder="搜库存..." v-model:value="sourceSearch" size="small">
                  <template #prefix><n-icon :component="Search" /></template>
                </n-input>
              </div>
            </div>

            <div class="list-wrapper">
              <div v-for="item in sourceList" :key="item.id" class="source-item" @click="addToBom(item)">
                <div class="item-main">
                  <div class="item-name">{{ getItemDisplay(item).tl }}</div>
                  
                  <div class="item-sub">
                    <n-tag v-if="getItemDisplay(item).trKey === 'package' && getItemDisplay(item).tr" size="tiny" :bordered="false" class="dark-tag">
                      {{ getItemDisplay(item).tr }}
                    </n-tag>
                    <span v-else class="sub-info">{{ getItemDisplay(item).tr }}</span>

                    <span class="val-text">{{ getItemDisplay(item).bl }}</span>
                  </div>
                </div>
                <n-button circle size="tiny" secondary class="add-btn"><template #icon><n-icon :component="Add" /></template></n-button>
              </div>
            </div>
          </div>

          <div class="divider">
            <n-icon :component="ArrowForward" class="arrow-icon" size="20" />
          </div>

          <div class="panel right-panel">
            <div class="panel-header-simple">
              <span>已选清单 ({{ bomList.length }})</span>
            </div>
            <div class="list-wrapper">
              <NEmpty v-if="bomList.length === 0" description="请从左侧添加" style="margin-top: 50px" />
              <div v-for="(item, index) in bomList" :key="item.inventory_id" class="bom-item">
                <div class="bom-info">
                  <div class="bom-name">
                    {{ getItemDisplay(item).tl }} 
                    <span v-if="getItemDisplay(item).bl" class="sub-detail">[{{ getItemDisplay(item).bl }}]</span>
                  </div>
                  <div class="bom-pkg">{{ getItemDisplay(item).tr }}</div>
                </div>
                <div class="bom-ctrl">
                  <span class="x-text">×</span>
                  <n-input-number v-model:value="item.quantity" size="tiny" :min="1" class="qty-input" />
                  <n-button circle size="tiny" text type="error" @click="removeFromBom(index)">
                    <n-icon :component="Remove" />
                  </n-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="footer">
          <n-button @click="emit('update:show', false)" class="btn-cancel">取消</n-button>
          <n-button type="primary" @click="handleSave" class="btn-save">
            <template #icon><n-icon :component="SaveOutline" /></template>
            保存项目
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.bom-modal {
  width: 950px;
  height: 800px;
  /* 背景变量化 */
  background-color: var(--bg-modal);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
}

:deep(.n-card__content) {
  flex: 1; overflow: hidden; padding: 20px 24px !important;
  display: flex; flex-direction: column;
}
:deep(.n-card-header) { 
  padding: 20px 24px 10px 24px !important; 
  /* 标题颜色 */
  color: var(--text-primary);
}
:deep(.n-card__footer) {
  padding: 16px 24px !important;
  border-top: 1px solid var(--border-main);
  background: rgba(0,0,0,0.02);
}

.modal-header span { font-weight: bold; font-size: 18px; color: var(--text-primary); }

.editor-layout { display: flex; flex-direction: column; height: 100%; gap: 16px; }

.meta-area { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-shrink: 0; }
.meta-left { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.name-input { font-weight: bold; }

.upload-panel {
  background: var(--bg-sidebar); 
  border: 1px dashed var(--border-main);
  border-radius: 8px;
  padding: 12px;
  flex-shrink: 0;
  display: flex; gap: 12px;
  height: 100px; 
}

.drop-zone {
  width: 200px; height: 100%;
  border: 1px dashed var(--border-main);
  border-radius: 6px;
  display: flex; justify-content: center; align-items: center;
  cursor: pointer; position: relative;
  transition: all 0.2s;
  background: var(--bg-card); 
}
.drop-zone:hover, .drop-zone.is-dragover { background: var(--border-hover); border-color: #0A84FF; }
.zone-content { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-tertiary); font-size: 12px; text-align: center; }

.file-grid { flex: 1; overflow-x: auto; overflow-y: hidden; }
.file-grid-inner { display: flex; gap: 10px; height: 100%; align-items: center; }
.file-item {
  width: 80px; height: 100%;
  background: var(--bg-card); border: 1px solid var(--border-main);
  border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; cursor: pointer;
  padding: 4px; box-sizing: border-box;
}
.file-item:hover { background: var(--border-hover); }
.file-icon { width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; font-size: 24px; color: var(--text-secondary); overflow: hidden; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
.file-name { font-size: 10px; color: var(--text-tertiary); width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.remove-btn { position: absolute; top: 2px; right: 2px; color: #FF453A; cursor: pointer; opacity: 0; font-size: 16px; }
.file-item:hover .remove-btn { opacity: 1; }

.split-area { flex: 1; display: flex; gap: 12px; align-items: center; overflow: hidden; min-height: 0; }

.panel {
  flex: 1; 
  border-radius: 12px;
  height: 100%; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border-main);
}
.left-panel { background: var(--bg-sidebar); } /* 左侧深色背景 */
.right-panel { background: var(--bg-card); } /* 右侧卡片背景 */

.panel-header-group {
  padding: 10px; background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border-main);
  display: flex; flex-direction: column; gap: 8px;
}
.filter-row { display: flex; gap: 6px; }
.mini-select { flex: 1; }
.panel-header-simple {
  padding: 12px; background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border-main);
  font-weight: bold; color: var(--text-tertiary);
}

.list-wrapper { flex: 1; overflow-y: auto; padding: 8px; }

.source-item, .bom-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; transition: all 0.2s;
}
.source-item { cursor: pointer; }
.source-item:hover { background: var(--border-hover); }

.item-name { font-weight: 700; color: var(--text-primary); font-size: 15px; margin-bottom: 2px; }
.item-sub { display: flex; gap: 6px; align-items: center; }
.val-text { color: var(--text-tertiary); font-size: 12px; }
.sub-info { color: var(--text-tertiary); font-size: 12px; }
.dark-tag { 
  background: var(--border-main); 
  color: var(--text-secondary); 
}

/* BOM 项样式：保持淡蓝色，文字自适应 */
.bom-item { 
  background: rgba(10, 132, 255, 0.1); 
  border: 1px solid rgba(10, 132, 255, 0.2); 
}
.bom-info { display: flex; flex-direction: column; }
.bom-name { color: var(--text-primary); font-size: 14px; font-weight: 600; }
.sub-detail { color: var(--text-tertiary); font-weight: normal; font-size: 13px; }
.bom-pkg { color: var(--text-tertiary); font-size: 12px; }

.bom-ctrl { display: flex; align-items: center; gap: 8px; }
.qty-input { width: 70px; }
.x-text { color: var(--text-tertiary); font-size: 12px; }
.divider { color: var(--text-tertiary); }
.footer { display: flex; justify-content: flex-end; gap: 12px; }
.btn-save { padding: 0 24px; font-weight: bold; }
</style>