<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  NModal, NCard, NButton, NIcon, NCheckbox, NScrollbar, 
  NAlert, useMessage, NInput, NDivider, NTag, NTabs, NTabPane
} from 'naive-ui'
import { 
  Close, Search, CubeOutline, LayersOutline, 
  DocumentTextOutline, ArchiveOutline
} from '@vicons/ionicons5'
import Papa from 'papaparse'

const props = defineProps<{ 
  show: boolean
  mode?: 'inventory' | 'project' // 作为初始选中的 Tab
}>()

const emit = defineEmits(['update:show'])
const message = useMessage()

// 状态管理
const activeTab = ref<'inventory' | 'project'>('inventory')
const isProcessing = ref(false)
const listData = ref<any[]>([]) 
const searchQuery = ref('')
const selectedIds = ref<number[]>([])

// 数据加载逻辑
const loadData = async () => {
  try {
    listData.value = []
    
    if (activeTab.value === 'project') {
      listData.value = await window.api.getProjects('')
    } else {
      const grouped = await window.api.fetchInventory({})
      const flat: any[] = []
      Object.values(grouped).forEach((group: any) => flat.push(...group))
      listData.value = flat
    }
  } catch (e) {
    console.error(e)
    message.error('加载数据失败')
  }
}

// 监听弹窗显示或 Tab 切换
watch(() => props.show, (val) => {
  if (val) {
    // 如果外部传入了初始模式，则应用，否则保持默认
    if (props.mode) activeTab.value = props.mode
    resetState()
    loadData()
  }
})

watch(activeTab, () => {
  if (props.show) {
    resetState()
    loadData()
  }
})

const resetState = () => {
  searchQuery.value = ''
  selectedIds.value = [] 
}

// 过滤与全选逻辑
const filteredList = computed(() => {
  if (!searchQuery.value) return listData.value
  const q = searchQuery.value.toLowerCase()
  
  return listData.value.filter(item => 
    (item.name && item.name.toLowerCase().includes(q)) ||
    (item.value && item.value.toLowerCase().includes(q)) ||
    (item.description && item.description.toLowerCase().includes(q)) ||
    (item.category && item.category.toLowerCase().includes(q))
  )
})

const isAllSelected = computed(() => {
  return filteredList.value.length > 0 && 
         filteredList.value.every(item => selectedIds.value.includes(item.id))
})

const toggleAll = () => {
  if (isAllSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = filteredList.value.map(item => item.id)
  }
}

const toggleItem = (id: number) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

// 导出 CSV (纯文本表格)
const handleExportCSV = async () => {
  if (selectedIds.value.length === 0) return message.warning('请至少选择一项')
  
  isProcessing.value = true
  try {
    const targets = listData.value.filter(i => selectedIds.value.includes(i.id))
    
    // 清洗数据，移除不需要的内部字段
    const cleanData = targets.map(item => {
      const { id, image_paths, datasheet_paths, files, ...rest } = item
      return rest
    })

    const csv = Papa.unparse(cleanData)
    const prefix = activeTab.value === 'inventory' ? 'Inventory' : 'Projects'
    
    await window.api.exportData({
      title: `导出 ${prefix} 表格`,
      filename: `${prefix}_Selection_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv
    })
    
    message.success('表格导出成功')
    return true
    emit('update:show', false)
  } catch (e) {
    message.error('导出失败')
    return false
  } finally {
    isProcessing.value = false
  }

}

// 导出资源包 (包含附件的完整备份)
const handleExportBundle = async () => {
  if (selectedIds.value.length === 0) return message.warning('请至少选择一项')

  isProcessing.value = true
  try {
    // 必须进行深拷贝以移除 Vue 的响应式 Proxy 包装，否则 Electron 无法序列化
    const rawIds = JSON.parse(JSON.stringify(selectedIds.value))

    const res = await window.api.exportBundle({
      type: 'custom',
      inventoryIds: activeTab.value === 'inventory' ? rawIds : undefined,
      projectIds: activeTab.value === 'project' ? rawIds : undefined
    })

    if (res && res.success) {
      const count = activeTab.value === 'project' ? res.count.projects : res.count.inventory
      message.success(`打包成功！包含 ${count} 项数据及关联文件`)
      emit('update:show', false)
    }
  } catch (e) {
    console.error(e)
    message.error('打包失败，请检查控制台详情')
  } finally {
    isProcessing.value = false
  }
  return
}
</script>

<template>
  <n-modal 
    :show="show" 
    @update:show="(v) => emit('update:show', v)"
    transform-origin="center"
  >
    <n-card class="wizard-modal" :bordered="false" role="dialog" aria-modal="true">
      
      <div class="modal-header">
        <div class="title">
          <n-icon size="22" :component="ArchiveOutline" color="#fff" />
          <span>导出向导</span>
        </div>
        <n-button text circle @click="emit('update:show', false)">
          <n-icon size="20" :component="Close" />
        </n-button>
      </div>

      <div class="modal-content">
        
        <n-tabs v-model:value="activeTab" type="segment" animated style="margin-bottom: 16px;">
          <n-tab-pane name="inventory" tab="库存元件">
            <template #tab>
              <n-icon :component="CubeOutline" style="margin-right: 6px" /> 库存元件
            </template>
          </n-tab-pane>
          <n-tab-pane name="project" tab="工程项目">
            <template #tab>
              <n-icon :component="LayersOutline" style="margin-right: 6px" /> 工程项目
            </template>
          </n-tab-pane>
        </n-tabs>

        <div class="toolbar-row">
          <div class="search-wrap">
            <n-input v-model:value="searchQuery" placeholder="搜索名称、描述或分类..." size="small" clearable>
              <template #prefix><n-icon :component="Search" /></template>
            </n-input>
          </div>
          <n-button size="small" secondary @click="toggleAll">
            {{ isAllSelected ? '取消全选' : '全选列表' }}
          </n-button>
        </div>

        <div class="list-box">
          <n-scrollbar style="max-height: 300px">
            <div v-if="filteredList.length === 0" class="empty-hint">无匹配数据</div>
            
            <div 
              v-for="item in filteredList" 
              :key="item.id" 
              class="list-item"
              :class="{ selected: selectedIds.includes(item.id) }"
              @click="toggleItem(item.id)"
            >
              <n-checkbox 
                :checked="selectedIds.includes(item.id)" 
                @click.stop="toggleItem(item.id)"
                class="item-check"
              />
              <div class="item-info">
                <div class="main-text">
                  <n-tag v-if="item.category" size="small" :bordered="false" type="info" style="margin-right: 8px">
                    {{ item.category }}
                  </n-tag>
                  {{ item.name }} 
                  <span v-if="item.value" class="sub-val">[{{ item.value }}]</span>
                </div>
                <div class="sub-text">
                  {{ activeTab === 'inventory' ? `${item.package || '-'} · 库存: ${item.quantity}` : (item.description || '无备注') }}
                </div>
              </div>
            </div>
          </n-scrollbar>
        </div>

        <div class="status-bar">
          <span>已选: <strong>{{ selectedIds.length }}</strong> 项</span>
        </div>

        <n-divider style="margin: 16px 0" />

        <n-alert type="info" :show-icon="false" class="hint-box">
          <div v-if="activeTab === 'project'">
            

[Image of structure]
 <strong>智能关联：</strong> 导出资源包时，系统会自动打包项目关联的 BOM 元器件及其图片/手册。
          </div>
          <div v-else>
            

[Image of zip file]
 <strong>资源包 (.svdata)：</strong> 本质是 ZIP 压缩包，包含图片和文档，可被其他用户完整导入，也可改后缀为 .zip 解压查看。
          </div>
        </n-alert>

      </div>

      <div class="modal-footer">
        <n-button 
          secondary 
          :disabled="selectedIds.length === 0 || isProcessing"
          @click="handleExportCSV"
        >
          <template #icon><n-icon :component="DocumentTextOutline" /></template>
          仅导出表格 (.csv)
        </n-button>

        <n-button 
          type="primary" 
          :disabled="selectedIds.length === 0"
          :loading="isProcessing"
          @click="handleExportBundle"
        >
          <template #icon><n-icon :component="ArchiveOutline" /></template>
          导出资源包 (.svdata)
        </n-button>
      </div>

    </n-card>
  </n-modal>
</template>

<style scoped>
.wizard-modal {
  width: 640px;
  background-color: #1c1c1e;
  border-radius: 16px;
  overflow: hidden;
}

:deep(.n-card__content) { padding: 0 !important; }

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex; justify-content: space-between; align-items: center;
}
.title { font-size: 17px; font-weight: bold; display: flex; align-items: center; gap: 10px; color: #fff; }

.modal-content { padding: 20px 24px; }

.toolbar-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.search-wrap { flex: 1; }

.list-box {
  background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);
  height: 300px; overflow: hidden;
}
.empty-hint { text-align: center; color: #666; margin-top: 40px; }

.list-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s;
}
.list-item:hover { background: rgba(255,255,255,0.05); }
.list-item.selected { background: rgba(10, 132, 255, 0.15); }

.item-info { flex: 1; }
.main-text { font-weight: bold; color: #fff; font-size: 14px; display: flex; align-items: center; }
.sub-val { color: #aaa; font-weight: normal; margin-left: 4px; }
.sub-text { font-size: 12px; color: #666; margin-top: 2px; }

.status-bar { text-align: right; font-size: 12px; color: #aaa; margin-top: 8px; }

.hint-box { font-size: 12px; color: #ccc; background: rgba(255,255,255,0.05); border: none; }

.modal-footer {
  padding: 16px 24px;
  background: rgba(0,0,0,0.2);
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex; justify-content: space-between; align-items: center;
}
</style>