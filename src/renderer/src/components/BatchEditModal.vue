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
  NModal, NInput, NButton, NIcon, NScrollbar, NInputNumber, 
  NTag, useMessage, useDialog, NSelect 
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
const dialog = useDialog()
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
    if (selectedIds.has(item.id)) return false
    
    const keyword = searchQuery.value.toLowerCase().trim()
    const matchSearch = !keyword || 
      (item.name || '').toLowerCase().includes(keyword) || 
      (item.value || '').toLowerCase().includes(keyword) ||
      (item.package || '').toLowerCase().includes(keyword)
      
    const matchCat = !filterCategory.value || item.category === filterCategory.value
    
    return matchSearch && matchCat
  })

  // 2. 🔥 截断显示：只显示前 100 条
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

  const riskyItems = selectedList.value.filter(item => {
    if (item.mode === 'add') return false 
    const predictedQty = item.quantity - item.delta
    return predictedQty < 0
  })

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
                <n-icon size="40" :component="ArrowForward" class="empty-icon" />
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
  /* 背景变量化 */
  background: var(--bg-modal);
  border-radius: 16px; overflow: hidden;
  box-shadow: 0 0 0 1px var(--border-main), 0 20px 50px rgba(0,0,0,0.5);
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
  /* 使用侧边栏背景，形成区分 */
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-main); 
}

/* 右侧面板 */
.panel.target-panel {
  flex: 1;
  /* 使用模态框背景 */
  background: var(--bg-modal);
  min-width: 0; 
}

.panel { display: flex; flex-direction: column; height: 100%; }

.panel-header {
  height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; 
  /* 边框变量化 */
  border-bottom: 1px solid var(--border-main);
}
.header-title { font-weight: 700; color: var(--text-primary); font-size: 14px; display: flex; align-items: center; gap: 8px; }

.search-bar { padding: 10px 12px; display: flex; gap: 8px; border-bottom: 1px solid var(--border-main); }
.cat-select { width: 90px; }

.list-wrapper { 
  flex: 1; 
  overflow: hidden; 
  position: relative; 
  display: flex; 
  flex-direction: column;
}
/* 右侧面板背景：无需额外颜色，保持透明或极淡 */
.target-bg { background: transparent; }

/* 列表项样式 */
.inventory-item {
  padding: 10px 16px; border-bottom: 1px solid var(--border-main); cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
}
.inventory-item:hover { background: var(--border-hover); }
.item-info { flex: 1; overflow: hidden; }
.item-main { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.item-val { font-weight: bold; color: var(--text-primary); font-size: 13px; }

/* 标签样式 */
.pkg-tag { 
  background: var(--border-main); 
  color: var(--text-secondary); 
  height: 16px; font-size: 10px; padding: 0 4px; 
}
.item-sub { font-size: 11px; color: var(--text-tertiary); }
.item-add-icon { color: var(--text-tertiary); transition: color 0.2s; }
.inventory-item:hover .item-add-icon { color: #0A84FF; }

/* 空状态样式 */
.empty-target { 
  flex: 1; 
  width: 100%;
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.dashed-box {
  width: 200px; height: 150px; 
  border: 2px dashed var(--border-main); 
  border-radius: 12px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--text-tertiary); 
  gap: 10px; text-align: center; font-size: 13px;
}
.empty-icon { color: var(--text-tertiary); }

/* 选中卡片样式 */
.selected-card {
  margin: 10px 16px; 
  /* 亮色模式下使用白色卡片 */
  background: var(--bg-card);
  border: 1px solid var(--border-main); 
  border-radius: 10px; padding: 10px 14px;
  display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05); /* 微弱阴影 */
}
.selected-card.add { border-left: 3px solid #30D158; }
.selected-card.sub { border-left: 3px solid #FF453A; }

.card-left { flex: 1; }
.card-val { font-weight: bold; font-size: 14px; color: var(--text-primary); }
.card-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }

.card-ctrl { display: flex; align-items: center; gap: 12px; }

/* 模式切换按钮 */
.mode-switch {
  cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;
  background: var(--border-main); 
  color: var(--text-secondary); 
  transition: all 0.2s;
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
  border-top: 1px solid var(--border-main); 
  background: var(--bg-modal);
}
.empty-tip { text-align: center; color: var(--text-tertiary); padding: 20px; font-size: 12px; }

@media (max-width: 768px) {
  .modal-body { flex-direction: column; }
  .source-panel { width: 100%; height: 50%; border-right: none; border-bottom: 1px solid var(--border-main); }
  .target-panel { width: 100%; height: 50%; }
}
</style>