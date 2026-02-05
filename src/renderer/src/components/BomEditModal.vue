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

// 🟢 被动器件分类（这些分类优先显示 Value）
const PASSIVE_CATS = ['电阻', '电容', '电感', '二极管', '保险丝', '跳线']

// 表单信息
const form = ref({
  id: undefined as number | undefined,
  name: '',
  description: ''
})

const bomList = ref<any[]>([])
const fileList = ref<string[]>([]) // 附件列表

// 状态控制
const isUploading = ref(false)
const isDragOver = ref(false)
const showUploadArea = ref(false) // 控制上传区折叠

// 左侧筛选状态
const sourceSearch = ref('')
const filterCategory = ref<string | null>(null)
const filterPackage = ref<string | null>(null)
const sourceList = ref<any[]>([])

// 选项列表
const categoryOptions = ref<any[]>([])
const packageOptions = ref<any[]>([])

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

watch(() => props.show, async (val) => {
  if (val) {
    await loadCategories()
    await loadPackages()

    if (props.projectData) {
      form.value = { ...props.projectData }
      
      // 加载 BOM 清单
      try {
        bomList.value = await window.api.getProjectDetail(props.projectData.id)
      } catch (e) { bomList.value = [] }

      // 加载附件
      try {
        const filesRaw = props.projectData.files
        fileList.value = filesRaw ? JSON.parse(filesRaw) : []
      } catch (e) { fileList.value = [] }

    } else {
      form.value = { id: undefined, name: '', description: '' }
      bomList.value = []
      fileList.value = []
    }
    
    // 重置状态
    sourceSearch.value = ''
    filterCategory.value = null
    filterPackage.value = null
    showUploadArea.value = false
    searchInventory()
  }
})

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
  
  // 使用项目名称作为分类，如果还没填名字，就用 'UnsavedProject'
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

// 智能点击：图片预览，其他文件打开文件夹
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
      // 保存附件列表
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
                  <div class="item-name">
                    {{ PASSIVE_CATS.includes(item.category) ? item.value : item.name }}
                  </div>
                  
                  <div class="item-sub">
                    <n-tag size="tiny" :bordered="false" class="dark-tag">{{ item.package }}</n-tag>
                    <span class="val-text">
                      {{ PASSIVE_CATS.includes(item.category) ? item.name : item.value }}
                    </span>
                  </div>
                </div>
                <n-button circle size="tiny" secondary class="add-btn"><template #icon><n-icon :component="Add" /></template></n-button>
              </div>
            </div>
          </div>

          <div class="divider">
            <n-icon :component="ArrowForward" color="#666" size="20" />
          </div>

          <div class="panel right-panel">
            <div class="panel-header-simple">
              <span>已选清单 ({{ bomList.length }})</span>
            </div>
            <div class="list-wrapper">
              <NEmpty v-if="bomList.length === 0" description="请从左侧添加" style="margin-top: 50px" />
              <div v-for="(item, index) in bomList" :key="item.inventory_id" class="bom-item">
                <div class="bom-info">
                  <div class="bom-name">{{ item.name }} <span v-if="item.value" class="sub-detail">[{{ item.value }}]</span></div>
                  <div class="bom-pkg">{{ item.package }}</div>
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
  height: 800px; /* 稍微增高以容纳上传区 */
  background-color: #1c1c1e;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
}

:deep(.n-card__content) {
  flex: 1; overflow: hidden; padding: 20px 24px !important;
  display: flex; flex-direction: column;
}
:deep(.n-card-header) { padding: 20px 24px 10px 24px !important; }
:deep(.n-card__footer) {
  padding: 16px 24px !important;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0,0,0,0.2);
}

.editor-layout { display: flex; flex-direction: column; height: 100%; gap: 16px; }

/* 顶部区域 */
.meta-area { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-shrink: 0; }
.meta-left { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.name-input { font-weight: bold; }

/* 上传面板 */
.upload-panel {
  background: rgba(255,255,255,0.03);
  border: 1px dashed rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 12px;
  flex-shrink: 0;
  display: flex; gap: 12px;
  height: 100px; /* 固定高度 */
}
.drop-zone {
  width: 200px; height: 100%;
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 6px;
  display: flex; justify-content: center; align-items: center;
  cursor: pointer; position: relative;
  transition: all 0.2s;
}
.drop-zone:hover, .drop-zone.is-dragover { background: rgba(255,255,255,0.05); border-color: #0A84FF; }
.zone-content { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #888; font-size: 12px; text-align: center; }

.file-grid { flex: 1; overflow-x: auto; overflow-y: hidden; }
.file-grid-inner { display: flex; gap: 10px; height: 100%; align-items: center; }
.file-item {
  width: 80px; height: 100%;
  background: rgba(0,0,0,0.3); border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; cursor: pointer;
  padding: 4px; box-sizing: border-box;
}
.file-item:hover { background: rgba(255,255,255,0.1); }
.file-icon { width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; font-size: 24px; color: #aaa; overflow: hidden; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
.file-name { font-size: 10px; color: #ccc; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.remove-btn { position: absolute; top: 2px; right: 2px; color: #FF453A; cursor: pointer; opacity: 0; font-size: 16px; }
.file-item:hover .remove-btn { opacity: 1; }

/* 分栏区域 */
.split-area { flex: 1; display: flex; gap: 12px; align-items: center; overflow: hidden; min-height: 0; }
.panel {
  flex: 1; background: rgba(255, 255, 255, 0.05); border-radius: 12px;
  height: 100%; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.05);
}

.panel-header-group {
  padding: 10px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column; gap: 8px;
}
.filter-row { display: flex; gap: 6px; }
.mini-select { flex: 1; }
.panel-header-simple {
  padding: 12px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.05);
  font-weight: bold; color: #aaa;
}

.list-wrapper { flex: 1; overflow-y: auto; padding: 8px; }

/* 列表项 */
.source-item, .bom-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; transition: all 0.2s;
}
.source-item { cursor: pointer; }
.source-item:hover { background: rgba(255,255,255,0.1); }

.item-name { font-weight: 700; color: #fff; font-size: 15px; margin-bottom: 2px; }
.item-sub { display: flex; gap: 6px; align-items: center; }
.val-text { color: #888; font-size: 12px; }
.dark-tag { background: rgba(255, 255, 255, 0.15); color: #ccc; }

.bom-item { background: rgba(10, 132, 255, 0.1); border: 1px solid rgba(10, 132, 255, 0.2); }
.bom-info { display: flex; flex-direction: column; }
.bom-name { color: #fff; font-size: 14px; font-weight: 600; }
.sub-detail { color: #aaa; font-weight: normal; font-size: 13px; }
.bom-pkg { color: #888; font-size: 12px; }

.bom-ctrl { display: flex; align-items: center; gap: 8px; }
.qty-input { width: 70px; }
.x-text { color: #666; font-size: 12px; }
.divider { color: #666; }
.footer { display: flex; justify-content: flex-end; gap: 12px; }
.btn-save { padding: 0 24px; font-weight: bold; }
</style>