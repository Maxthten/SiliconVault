<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  NModal, NInput, NButton, NIcon, NScrollbar, NInputNumber, 
  NTag, useMessage, useDialog, NSelect // 引入 useDialog
} from 'naive-ui'
import { 
  Search, Add, ArrowForward, TrashOutline, 
  CubeOutline, FlashOutline
} from '@vicons/ionicons5'
import EditDialog from './EditDialog.vue' 

interface InventoryItem {
  id: number
  name: string
  value: string
  package: string
  category: string
  quantity: number
  location?: string
}

interface SelectedItem extends InventoryItem {
  mode: 'add' | 'sub'
  delta: number
}

interface Props {
  show: boolean
  allInventory: InventoryItem[]
}

const props = defineProps<Props>()
const emit = defineEmits(['update:show', 'refresh'])

const message = useMessage()
const dialog = useDialog() // 🔥 初始化对话框
const isLoading = ref(false)

// 状态
const searchQuery = ref('')
const filterCategory = ref<string | null>(null)
const selectedList = ref<SelectedItem[]>([])

// 新建弹窗控制
const showCreateModal = ref(false)
const previousIds = ref<Set<number>>(new Set())

// === 🚀 核心优化：列表过滤 + 数量限制 (解决卡顿) ===
const filteredSourceList = computed(() => {
  const list = props.allInventory || [] 
  const selectedIds = new Set(selectedList.value.map(i => i.id))
  
  // 1. 过滤逻辑
  const result = list.filter(item => {
    // 排除已选
    if (selectedIds.has(item.id)) return false
    
    // 关键词搜索
    const keyword = searchQuery.value.toLowerCase().trim()
    const matchSearch = !keyword || 
      (item.name || '').toLowerCase().includes(keyword) || 
      (item.value || '').toLowerCase().includes(keyword) ||
      (item.package || '').toLowerCase().includes(keyword)
      
    // 分类筛选
    const matchCat = !filterCategory.value || item.category === filterCategory.value
    
    return matchSearch && matchCat
  })

  // 2. 🔥 截断显示：只显示前 100 条，防止渲染几千个 DOM 卡死
  return result.slice(0, 100)
})

const categoryOptions = computed<any[]>(() => {
  const list = props.allInventory || []
  const cats = new Set(list.map(i => i.category).filter(c => c))
  return [{ label: '全部分类', value: null }, ...Array.from(cats).map(c => ({ label: c, value: c }))]
})

// 动作
const addToSelected = (item: InventoryItem) => {
  selectedList.value.push({ ...item, mode: 'add', delta: 1 })
}
const removeFromSelected = (index: number) => {
  selectedList.value.splice(index, 1)
}
const toggleMode = (item: SelectedItem) => {
  item.mode = item.mode === 'add' ? 'sub' : 'add'
}

// 新建相关
const openCreateModal = () => {
  previousIds.value = new Set((props.allInventory || []).map(i => i.id))
  showCreateModal.value = true
}
const onCreateSuccess = () => {
  emit('refresh')
}

// 自动添加新建项
watch(() => props.allInventory, (newVal) => {
  if (!showCreateModal.value || !newVal) return
  const newItem = newVal.find(item => !previousIds.value.has(item.id))
  if (newItem) {
    addToSelected(newItem)
    message.success(`已自动添加: ${newItem.name}`)
    previousIds.value = new Set((props.allInventory || []).map(i => i.id))
  }
}, { deep: true })

// === 🔥 核心逻辑：执行更新 ===
const executeBatchUpdate = async () => {
  isLoading.value = true
  try {
    const tasks = selectedList.value.map(item => {
      let newQty = item.quantity
      if (item.mode === 'add') {
        newQty += item.delta
      } else {
        // 📉 允许减到负数 (透支模式)
        newQty -= item.delta 
      }
      return window.api.updateQty(item.id, newQty)
    })
    
    await Promise.all(tasks)
    message.success(`成功更新 ${tasks.length} 个元件库存`)
    emit('refresh')
    emit('update:show', false)
    selectedList.value = []
  } catch (e) {
    console.error(e)
    message.error('批量执行失败')
  } finally {
    isLoading.value = false
  }
}

// === 🔥 核心逻辑：预检查负库存 ===
const handleCheckAndExecute = () => {
  if (selectedList.value.length === 0) return

  // 1. 找出所有会变成负数（或更负）的危险操作
  const riskyItems = selectedList.value.filter(item => {
    if (item.mode === 'add') return false // 加库存没事
    const predictedQty = item.quantity - item.delta
    return predictedQty < 0
  })

  // 2. 如果有风险，弹窗警告
  if (riskyItems.length > 0) {
    dialog.warning({
      title: '库存不足警告',
      content: `以下 ${riskyItems.length} 个元件库存将被扣减为负数（透支）：\n\n` + 
               riskyItems.slice(0, 3).map(i => `• ${i.value || i.name}`).join('\n') + 
               (riskyItems.length > 3 ? `\n...等共 ${riskyItems.length} 个` : '') + 
               `\n\n确定要继续吗？`,
      positiveText: '确认透支',
      negativeText: '取消',
      onPositiveClick: () => {
        executeBatchUpdate()
      }
    })
  } else {
    // 3. 没风险，直接干
    executeBatchUpdate()
  }
}

watch(() => props.show, (val) => {
  if (val) {
    selectedList.value = []
    searchQuery.value = ''
  }
})
</script>

<template>
  <n-modal 
    :show="show" 
    @update:show="(v) => emit('update:show', v)"
    :bordered="false"
  >
    <div class="batch-runner-modal">
      <div class="modal-body">
        
        <div class="panel source-panel">
          <div class="panel-header">
            <div class="header-title">
              <n-icon :component="CubeOutline" /> 库存列表
            </div>
            <n-button size="small" type="primary" dashed @click="openCreateModal">
              <template #icon><n-icon :component="Add" /></template>
              新建
            </n-button>
          </div>

          <div class="search-bar">
            <n-input v-model:value="searchQuery" placeholder="搜索型号/封装..." size="small" clearable>
              <template #prefix><n-icon :component="Search" /></template>
            </n-input>
            <n-select v-model:value="filterCategory" :options="categoryOptions" size="small" placeholder="分类" class="cat-select" />
          </div>

          <div class="list-wrapper">
            <n-scrollbar>
              <div v-if="filteredSourceList.length === 0" class="empty-tip">未找到相关元件</div>
              <div v-for="item in filteredSourceList" :key="item.id" class="inventory-item" @click="addToSelected(item)">
                <div class="item-info">
                  <div class="item-main">
                    <span class="item-val">{{ item.value || item.name }}</span>
                    <n-tag v-if="item.package" size="small" :bordered="false" class="pkg-tag">{{ item.package }}</n-tag>
                  </div>
                  <div class="item-sub">{{ item.name }} · 库存: {{ item.quantity }}</div>
                </div>
                <div class="item-add-icon"><n-icon :component="ArrowForward" /></div>
              </div>
            </n-scrollbar>
          </div>
        </div>

        <div class="panel target-panel">
          <div class="panel-header target-header">
            <div class="header-title">
              <n-icon :component="FlashOutline" /> 待执行清单 ({{ selectedList.length }})
            </div>
            <n-button text size="tiny" v-if="selectedList.length > 0" @click="selectedList = []">清空</n-button>
          </div>

          <div class="list-wrapper target-bg">
            <div v-if="selectedList.length === 0" class="empty-target">
              <div class="dashed-box">
                <n-icon size="40" :component="ArrowForward" color="#444" />
                <p>从左侧添加<br>或新建元件</p>
              </div>
            </div>

            <n-scrollbar v-else>
              <div v-for="(item, index) in selectedList" :key="item.id" class="selected-card" :class="item.mode">
                <div class="card-left">
                  <div class="card-val">{{ item.value || item.name }}</div>
                  <div class="card-sub">{{ item.package }} | 现存: {{ item.quantity }}</div>
                </div>
                <div class="card-ctrl">
                  <div class="mode-switch" @click="toggleMode(item)" :class="item.mode">
                    <div class="switch-bg"></div>
                    <span class="switch-text">{{ item.mode === 'add' ? '入库' : '消耗' }}</span>
                  </div>
                  <n-input-number v-model:value="item.delta" size="small" :min="1" class="delta-input" :show-button="false">
                    <template #prefix>
                       <span :class="item.mode === 'add' ? 'green-t' : 'red-t'">{{ item.mode === 'add' ? '+' : '-' }}</span>
                    </template>
                  </n-input-number>
                  <n-button circle text size="small" type="error" @click="removeFromSelected(index)">
                    <template #icon><n-icon :component="TrashOutline" /></template>
                  </n-button>
                </div>
              </div>
            </n-scrollbar>
          </div>

          <div class="panel-footer">
            <n-button block type="primary" :disabled="selectedList.length === 0" :loading="isLoading" @click="handleCheckAndExecute">
              确认执行 ({{ selectedList.length }})
            </n-button>
          </div>
        </div>

      </div>
    </div>
  </n-modal>

  <EditDialog v-model:show="showCreateModal" :edit-data="null" @refresh="onCreateSuccess" />
</template>

<style scoped>
/* 容器样式：严格限制宽高 */
.batch-runner-modal { 
  width: 950px; max-width: 95vw; height: 750px; max-height: 85vh;
  background: #1c1c1e; border-radius: 16px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
}

.modal-body {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden; 
}

/* 左侧面板 */
.panel.source-panel {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.08); 
  background: rgba(0,0,0,0.2);
}

/* 右侧面板 */
.panel.target-panel {
  flex: 1;
  background: #1c1c1e;
  min-width: 0; 
}

.panel { display: flex; flex-direction: column; height: 100%; }

.panel-header {
  height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.header-title { font-weight: 700; color: #fff; font-size: 14px; display: flex; align-items: center; gap: 8px; }

.search-bar { padding: 10px 12px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.cat-select { width: 90px; }

/* 核心布局修复：列表容器 */
.list-wrapper { 
  flex: 1; 
  overflow: hidden; 
  position: relative; 
  display: flex; 
  flex-direction: column; /* 确保子元素（如空状态）可以 flex 伸缩 */
}
.target-bg { background: rgba(0,0,0,0.1); }

.inventory-item {
  padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
}
.inventory-item:hover { background: rgba(255,255,255,0.05); }
.item-info { flex: 1; overflow: hidden; }
.item-main { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.item-val { font-weight: bold; color: #eee; font-size: 13px; }
.pkg-tag { background: rgba(255,255,255,0.1); color: #888; height: 16px; font-size: 10px; padding: 0 4px; }
.item-sub { font-size: 11px; color: #666; }
.item-add-icon { color: #444; transition: color 0.2s; }
.inventory-item:hover .item-add-icon { color: #0A84FF; }

/* 🔥 修复：空状态样式 */
.empty-target { 
  flex: 1; /* 占满 list-wrapper 剩余空间 */
  width: 100%;
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.dashed-box {
  width: 200px; height: 150px; border: 2px dashed rgba(255,255,255,0.1); border-radius: 12px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #555; gap: 10px; text-align: center; font-size: 13px;
}

.selected-card {
  margin: 10px 16px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 10px 14px;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
}
.selected-card.add { border-left: 3px solid #30D158; }
.selected-card.sub { border-left: 3px solid #FF453A; }

.card-left { flex: 1; }
.card-val { font-weight: bold; font-size: 14px; color: #fff; }
.card-sub { font-size: 11px; color: #666; margin-top: 2px; }

.card-ctrl { display: flex; align-items: center; gap: 12px; }

.mode-switch {
  cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;
  background: rgba(255,255,255,0.1); color: #888; transition: all 0.2s;
}
.mode-switch.add { background: rgba(48, 209, 88, 0.15); color: #30D158; }
.mode-switch.sub { background: rgba(255, 69, 58, 0.15); color: #FF453A; }
.mode-switch:active { transform: scale(0.95); }

.delta-input { width: 80px; text-align: center; }
.green-t { color: #30D158; font-weight: bold; }
.red-t { color: #FF453A; font-weight: bold; }

/* 底部固定区域 */
.panel-footer { 
  flex-shrink: 0; 
  padding: 16px; 
  border-top: 1px solid rgba(255,255,255,0.05); 
  background: #1c1c1e;
}
.empty-tip { text-align: center; color: #666; padding: 20px; font-size: 12px; }

@media (max-width: 768px) {
  .modal-body { flex-direction: column; }
  .source-panel { width: 100%; height: 50%; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .target-panel { width: 100%; height: 50%; }
}
</style>