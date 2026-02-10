<script setup lang="ts">
import { ref, watch, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  Add, RocketOutline, CreateOutline, TrashOutline, TimeOutline, Search, 
  CheckmarkOutline, SettingsOutline, DocumentTextOutline, FolderOpenOutline,
  
} from '@vicons/ionicons5'
import { NButton, NIcon, NEmpty, NSpin, useDialog, useMessage, NInput, NPopover, NCarousel, NDropdown, NTag } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus' 
import BomEditModal from '../components/BomEditModal.vue'
import BomRunModal from '../components/BomRunModal.vue'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()

const openFile = (path: string) => {
  window.api.openFile(path)
}

const projects = ref<any[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const isManageMode = ref(false)
const isDragging = ref(false)

// 关联筛选状态
const isFilterMode = ref(false)
const filterIds = ref<number[]>([])
const projectNamesMap = ref(new Map<number, string>())

const showEdit = ref(false)
const showRun = ref(false)
const currentProject = ref<any>(null)

// --- 数据加载 ---
const loadProjects = async () => {
  isLoading.value = true
  try {
    let result: any[] = []
    
    if (isFilterMode.value && filterIds.value.length > 0) {
      result = await window.api.getProjects(searchQuery.value, [...filterIds.value])
    } else {
      result = await window.api.getProjects(searchQuery.value)
    }

    projects.value = result

    result.forEach(p => {
      if (p.id && p.name) {
        projectNamesMap.value.set(p.id, p.name)
      }
    })

  } catch (e) {
    console.error(e)
    message.error('加载失败')
  } finally {
    isLoading.value = false
  }
}

watch(
  () => route.query,
  (newQuery) => {
    if (newQuery.ids) {
      isFilterMode.value = true
      filterIds.value = String(newQuery.ids).split(',').map(Number)
    } else {
      isFilterMode.value = false
      filterIds.value = []
    }
    loadProjects()
  },
  { immediate: true }
)

const removeFilterId = (idToRemove: number) => {
  const newIds = filterIds.value.filter(id => id !== idToRemove)
  
  if (newIds.length > 0) {
    router.replace({ query: { ...route.query, ids: newIds.join(',') } })
  } else {
    clearAllFilters()
  }
}

const clearAllFilters = () => {
  searchQuery.value = ''
  router.replace({ query: {} }) 
}

const getProjectName = (id: number) => {
  return projectNamesMap.value.get(id) || `项目 #${id}`
}

watch(searchQuery, () => { loadProjects() })

const onDragStart = () => {
  isDragging.value = true
  if (navigator.vibrate) navigator.vibrate(30)
}

const onDragEnd = async () => {
  isDragging.value = false
  const newIds = projects.value.map(p => p.id)
  try {
    await window.api.updateSortOrder('projects', newIds)
  } catch (e) { message.error('排序保存失败') }
}

const handleCreate = () => { currentProject.value = null; showEdit.value = true }
const handleEdit = (proj: any) => { currentProject.value = proj; showEdit.value = true }
const handleRun = (proj: any) => { currentProject.value = proj; showRun.value = true }

const handleDelete = (id: number) => {
  dialog.warning({
    title: '删除项目',
    content: '确定要删除这个 BOM 吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await window.api.deleteProject(id)
      message.success('已删除')
      loadProjects()
    }
  })
}

// --- 📂 文件处理核心逻辑 ---
const parseFiles = (jsonStr?: string): string[] => {
  if (!jsonStr) return []
  try { return JSON.parse(jsonStr) || [] } catch { return [] }
}
const isImage = (path: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(path.split('.').pop()?.toLowerCase() || '')
const handleSmartClick = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext || '')) {
    window.api.openFile(path)
  } else {
    window.api.showItemInFolder(path)
  }
}
const getImages = (jsonStr?: string) => parseFiles(jsonStr).filter(f => isImage(f)).map(p => ({ url: `local-resource://${p}`, originalPath: p }))
const getDocs = (jsonStr?: string) => parseFiles(jsonStr).filter(f => !isImage(f))
const getDocOptions = (files: string[]) => files.map(f => ({ label: f.split('/').pop()?.replace(/^\d+_/, '') || '文件', key: f, icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) }) }))
</script>

<template>
  <div class="bom-page">
    <div class="toolbar">
      
      <div class="search-box">
        <n-input 
          v-model:value="searchQuery" 
          placeholder="搜索项目..." 
          round 
          clearable 
          class="ios-search token-input"
          @clear="clearAllFilters"
        >
          <template #prefix>
            <div v-if="filterIds.length > 0" class="chip-container">
              <transition-group name="list">
                <n-tag 
                  v-for="id in filterIds" 
                  :key="id" 
                  :bordered="false"
                  round 
                  closable 
                  class="filter-chip ios-chip"
                  @close.stop="removeFilterId(id)"
                >
                  {{ getProjectName(id) }}
                </n-tag>
              </transition-group>
            </div>
            <n-icon v-else :component="Search" class="search-icon" />
          </template>
        </n-input>
      </div>

      <div class="tools">
        <n-button secondary strong circle :type="isManageMode ? 'primary' : 'default'" @click="isManageMode = !isManageMode">
          <template #icon><n-icon :component="isManageMode ? CheckmarkOutline : CreateOutline" /></template>
        </n-button>
        <n-button type="primary" circle @click="handleCreate">
          <template #icon><n-icon :component="Add" /></template>
        </n-button>
      </div>
    </div>

    <div class="content">
      <n-spin :show="isLoading">
        <NEmpty v-if="projects.length === 0 && !isLoading" description="暂无项目" class="empty">
          <template #extra v-if="isFilterMode || searchQuery">
            <n-button size="small" @click="clearAllFilters">清除筛选</n-button>
          </template>
        </NEmpty>
        
        <VueDraggable 
          v-model="projects"
          :animation="350"
          :disabled="!isManageMode"
          ghostClass="ghost"
          dragClass="drag-active"
          class="project-grid"
          @start="onDragStart"
          @end="onDragEnd"
        >
          <div 
            v-for="p in projects" 
            :key="p.id" 
            class="project-card"
            :class="{ 'is-draggable': isManageMode, 'is-shaking': isDragging }"
            :style="{ animationDelay: isDragging ? (Math.random() * -0.5 + 's') : '0s' }"
            @click="!isManageMode && handleEdit(p)"
          >
            <div class="card-header-row">
              <div class="header-left">
                <div class="p-name">{{ p.name }}</div>
                <div class="p-date">
                  <n-icon :component="TimeOutline" /> {{ new Date(p.created_at).toLocaleDateString() }}
                </div>
              </div>
              <div class="header-right-media" @click.stop>
                <div v-if="getImages(p.files).length > 0" class="thumb-section">
                  <n-popover trigger="hover" placement="bottom-end" style="padding: 0; border-radius: 12px; overflow: hidden;" :show-arrow="false">
                    <template #trigger>
                      <div class="cover-wrapper">
                        <img :src="getImages(p.files)[0].url" loading="lazy" class="cover-img" />
                        <div v-if="getImages(p.files).length > 1" class="count-badge">{{ getImages(p.files).length }}</div>
                      </div>
                    </template>
                    <div class="preview-popover">
                      <n-carousel show-arrow autoplay style="width: 280px; height: 280px">
                        <div v-for="(img, idx) in getImages(p.files)" :key="idx" class="carousel-item" @click="openFile(img.originalPath)">
                          <img :src="img.url" class="carousel-img" />
                          <div class="carousel-hint">点击预览</div>
                        </div>
                      </n-carousel>
                    </div>
                  </n-popover>
                </div>
                <div v-if="getDocs(p.files).length > 0" class="doc-section">
                  <div v-if="getDocs(p.files).length === 1" class="doc-trigger clickable" @click.stop="handleSmartClick(getDocs(p.files)[0])" title="点击打开">
                     <n-icon :component="DocumentTextOutline" color="#ff4d4f" size="20" />
                  </div>
                  <n-dropdown v-else trigger="click" :options="getDocOptions(getDocs(p.files))" @select="handleSmartClick">
                    <div class="doc-trigger clickable multi">
                      <n-icon :component="FolderOpenOutline" color="#409CFF" size="20" />
                      <span class="doc-count">{{ getDocs(p.files).length }}</span>
                    </div>
                  </n-dropdown>
                </div>
              </div>
            </div>
            <div class="p-desc">{{ p.description || '暂无备注' }}</div>
            <div class="card-actions">
              <Transition name="fade-slide" mode="out-in">
                <div v-if="!isManageMode" class="mode-run">
                   <div></div>
                   <n-button type="success" secondary class="run-btn" @click.stop="handleRun(p)">
                    <template #icon><n-icon :component="RocketOutline" /></template>
                    生产扣减
                  </n-button>
                </div>
                <div v-else class="mode-manage">
                  <div class="manage-btns">
                    <n-button circle size="small" secondary @click.stop="handleEdit(p)">
                      <template #icon><n-icon :component="CreateOutline" /></template>
                    </n-button>
                    <n-button circle size="small" secondary type="error" @click.stop="handleDelete(p.id)">
                      <template #icon><n-icon :component="TrashOutline" /></template>
                    </n-button>
                  </div>
                  <div class="drag-hint">
                    <n-icon size="16" :component="SettingsOutline" /> 拖拽排序
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </VueDraggable>
      </n-spin>
    </div>

    <BomEditModal v-model:show="showEdit" :project-data="currentProject" @refresh="loadProjects" />
    <BomRunModal v-model:show="showRun" :project="currentProject" @success="loadProjects" />
  </div>
</template>

<style scoped>
.bom-page {
  height: 100vh;
  display: flex; flex-direction: column; overflow: hidden; 
}
.toolbar {
  padding: 12px 16px; display: flex; gap: 12px; align-items: center;
  position: sticky; top: 0; z-index: 100;
  /*使用变量背景 */
  background: var(--bg-sidebar); 
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-main);
}
.search-box { flex: 1; display: flex; align-items: center; }

.tools { display: flex; gap: 12px; }

/* 令牌化输入框样式 - 适配亮色模式 */
:deep(.n-input) { 
  background-color: rgba(118, 118, 128, 0.24) !important; 
  border: none !important; 
  border-radius: 8px !important; 
  padding-left: 4px !important;
}
:deep(.n-input:hover), :deep(.n-input:focus-within) { 
  background-color: rgba(118, 118, 128, 0.35) !important; 
}

/* 亮色模式下输入框优化 */
:global([data-theme="light"]) .toolbar :deep(.n-input),
:global([data-theme="light"]) .toolbar :deep(.n-base-selection-label) {
  background-color: rgba(0, 0, 0, 0.05) !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}
:global([data-theme="light"]) .toolbar :deep(.n-input:hover),
:global([data-theme="light"]) .toolbar :deep(.n-input:focus-within) {
  background-color: rgba(0, 0, 0, 0.08) !important;
}

/* 强制文字颜色 */
:deep(.n-input .n-input__input-el) { color: var(--text-primary) !important; }
:deep(.n-input .n-input__placeholder) { color: var(--text-tertiary) !important; }

/* 胶囊容器 */
.chip-container {
  display: flex; 
  gap: 6px; 
  align-items: center; 
  margin-right: 6px;
  padding: 2px 0;
  max-width: 100%; overflow-x: auto; 
  white-space: nowrap; scrollbar-width: none;
}
.chip-container::-webkit-scrollbar { display: none; }

/* iOS 风格胶囊 - 颜色保持蓝色调 */
.ios-chip {
  background: rgba(10, 132, 255, 0.15) !important; 
  color: #0A84FF !important; 
  font-weight: 600;
  font-size: 12px;
  height: 24px;
  padding: 0 10px;
  border: none !important; 
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.ios-chip:hover {
  background: rgba(10, 132, 255, 0.25) !important;
  transform: translateY(-0.5px);
}

:deep(.n-tag__close) {
  margin-left: 6px !important;
  font-size: 14px !important;
  color: rgba(10, 132, 255, 0.6) !important;
  border-radius: 50%; width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s ease;
}

:deep(.n-tag__close:hover) {
  background-color: #0A84FF !important;
  color: #fff !important;
  transform: scale(1.1);
}

.list-enter-active, .list-leave-active { transition: all 0.3s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: scale(0.8); width: 0; margin-right: 0; }

.search-icon { margin-left: 8px; color: var(--text-tertiary); }

.content { flex: 1; overflow-y: auto; padding: 20px; }
.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }

/* 项目卡片核心 */
.project-card {
  background: var(--bg-card); /* 变量化背景 */
  border-radius: 16px; padding: 16px;
  border: 1px solid var(--border-main); /* 变量化边框 */
  box-shadow: var(--shadow-card); /* 亮色模式增加阴影 */
  transition: all 0.2s; position: relative; z-index: 1; user-select: none; cursor: pointer;
  display: flex; flex-direction: column; gap: 10px;
}
.project-card:hover { 
  background: var(--bg-card);
  border-color: var(--border-hover); 
  transform: translateY(-2px);
}
.project-card.is-draggable { cursor: grab; border-style: dashed; border-color: var(--border-hover); }

/* 头部布局 */
.card-header-row { display: flex; justify-content: space-between; align-items: flex-start; }
.header-left { flex: 1; min-width: 0; }
.p-name { font-size: 17px; font-weight: bold; color: var(--text-primary); margin-bottom: 4px; }
.p-date { font-size: 12px; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px; }
.header-right-media { display: flex; gap: 10px; align-items: center; }

.thumb-section { width: 44px; height: 44px; flex-shrink: 0; cursor: zoom-in; }
.cover-wrapper { width: 100%; height: 100%; position: relative; border-radius: 8px; overflow: hidden; background: #000; border: 1px solid var(--border-main); }
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.count-badge { position: absolute; bottom: 0; right: 0; background: rgba(0,0,0,0.7); color: white; font-size: 9px; padding: 1px 4px; border-top-left-radius: 4px; }

.doc-section { display: flex; align-items: center; }
.doc-trigger { 
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; 
  background: var(--border-main); /* 文档按钮背景变量化 */
  border-radius: 8px; border: 1px solid transparent; transition: all 0.2s; 
}
.doc-trigger.clickable { cursor: pointer; }
.doc-trigger.clickable:hover { background: var(--border-hover); transform: scale(1.05); }
.multi { gap: 2px; }
.doc-count { font-size: 10px; font-weight: bold; margin-top: 2px; color: var(--text-secondary); }

.preview-popover { background: #000; }
.carousel-item { width: 100%; height: 100%; position: relative; cursor: pointer; display: flex; justify-content: center; align-items: center; }
.carousel-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.carousel-hint { position: absolute; bottom: 10px; background: rgba(0,0,0,0.6); color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; opacity: 0; transition: opacity 0.3s; }
.carousel-item:hover .carousel-hint { opacity: 1; }

.p-desc { font-size: 13px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -4px; }
.card-actions { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-main); }

.mode-run, .mode-manage { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.run-btn { font-weight: bold; width: 100%; }
.manage-btns { display: flex; gap: 10px; }
.drag-hint { font-size: 12px; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px; }

@keyframes jiggle { 0% { transform: rotate(0deg); } 25% { transform: rotate(-0.8deg); } 75% { transform: rotate(0.8deg); } 100% { transform: rotate(0deg); } }
.is-shaking { animation: jiggle 0.28s infinite ease-in-out; }

/* 拖拽态 */
.drag-active { 
  animation: none !important; transform: scale(1.05) !important; 
  background: var(--bg-card); 
  color: var(--text-primary);
  border: 1px solid #0A84FF; z-index: 1000 !important; cursor: grabbing; 
}
.ghost { opacity: 0; background: transparent; border: none; pointer-events: none; }

@media (max-width: 768px) { .toolbar { padding: 12px 16px; } .content { padding: 16px; } .project-grid { grid-template-columns: 1fr; } }
</style>