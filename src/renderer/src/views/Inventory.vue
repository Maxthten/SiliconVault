<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { 
  Search, Add, CreateOutline, CheckmarkOutline, 
  ChevronDown, ChevronForward, SettingsOutline, FlashOutline
} from '@vicons/ionicons5'
import { NInput, NButton, NIcon, NSpin, NSelect, useMessage, useDialog } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import InventoryCard from '../components/InventoryCard.vue'
import EditDialog from '../components/EditDialog.vue'
import BatchEditModal from '../components/BatchEditModal.vue'

const searchQuery = ref('')
const filterCategory = ref<string | null>(null)
const filterPackage = ref<string | null>(null)
const categoryOptions = ref<any[]>([])
const packageOptions = ref<any[]>([])
const categoryRules = ref<Record<string, any>>({})

const isEditMode = ref(false)
const isLoading = ref(false)
const isDragging = ref(false)

const sortedGroups = ref<{ name: string, collapsed: boolean, items: any[] }[]>([])

const showModal = ref(false)
const showBatchModal = ref(false)
const currentEditItem = ref<any>(null)

const message = useMessage()
const dialog = useDialog()

const allFlatItems = computed(() => {
  const flat = [] as any[]
  sortedGroups.value.forEach(group => {
    flat.push(...group.items)
  })
  return flat
})

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
  } catch (e) { console.error('加载规则失败', e) }
}

const loadPackages = async () => {
  try {
    const pkgs = await window.api.fetchPackages(filterCategory.value || undefined)
    packageOptions.value = [{ label: '全部封装', value: null }, ...pkgs.map(p => ({ label: p, value: p }))]
  } catch (e) { console.error(e) }
}

const loadOptions = async () => {
  try {
    const cats = await window.api.fetchCategories()
    categoryOptions.value = [{ label: '全部分类', value: null }, ...cats.map(c => ({ label: c, value: c }))]
    await loadPackages()
  } catch (e) { console.error(e) }
}

const loadData = async () => {
  isLoading.value = true
  try {
    await loadRules()

    const data = await window.api.fetchInventory({
      keyword: searchQuery.value,
      category: filterCategory.value || undefined,
      package: filterPackage.value || undefined
    })
    
    const oldStateMap = new Map(sortedGroups.value.map(g => [g.name, g.collapsed]))
    
    sortedGroups.value = Object.entries(data).map(([catName, items]) => ({
      name: catName,
      collapsed: oldStateMap.get(catName) || false,
      items: items
    }))

  } catch (error) {
    message.error('加载失败: ' + error)
  } finally {
    isLoading.value = false
  }
}

watch(filterCategory, () => { loadPackages(); filterPackage.value = null; loadData() })
watch([searchQuery, filterPackage], () => { loadData() })

const onDragStart = () => {
  isDragging.value = true
  if (navigator.vibrate) navigator.vibrate(30)
}

const onItemDragEnd = async (evt: any) => {
  isDragging.value = false
  if (evt.newIndex === evt.oldIndex) return
  try {
    const allUpdatePromises = sortedGroups.value.map(group => {
       const ids = group.items.map(i => i.id)
       return window.api.updateSortOrder('inventory', ids)
    })
    await Promise.all(allUpdatePromises)
  } catch (e) { console.error(e) }
}
const onCategoryDragEnd = () => { isDragging.value = false }

const handleQtyUpdate = async (item: any, delta: number) => {
  const newQty = item.quantity + delta
  if (delta < 0 && newQty < 0) return
  item.quantity = newQty
  await window.api.updateQty(item.id, newQty)
}

const handleDelete = (id: number) => {
  dialog.warning({
    title: '确认删除',
    content: '删除后无法恢复，确定吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.api.deleteItem(id)
        message.success('已删除')
        loadData()
        loadOptions()
      } catch (e: any) {
        if (e.message && e.message.includes('无法删除')) {
          dialog.error({
            title: '占用警告',
            content: e.message, 
            positiveText: '知道了'
          })
        } else {
          message.error('删除失败: ' + (e.message || '未知错误'))
        }
      }
    }
  })
}

const handleEdit = (item: any) => { currentEditItem.value = item; showModal.value = true }
const handleAdd = () => { currentEditItem.value = null; showModal.value = true }
const onSaveSuccess = () => { loadData(); loadOptions() }

const toggleCollapse = (group: any) => {
  if (isDragging.value) return 
  group.collapsed = !group.collapsed
}

onMounted(() => { loadOptions(); loadData() })
</script>

<template>
  <div class="inventory-page">
    
    <div class="toolbar">
      <div class="filter-group">
        <n-select v-model:value="filterCategory" :options="categoryOptions" placeholder="分类" class="mini-select" size="small" />
        <n-select v-model:value="filterPackage" :options="packageOptions" placeholder="封装" class="mini-select" size="small" />
      </div>

      <div class="search-box">
        <n-input v-model:value="searchQuery" placeholder="搜索..." round clearable class="ios-search">
          <template #prefix><n-icon :component="Search" /></template>
        </n-input>
      </div>

      <div class="tools">
        <n-button 
          secondary strong circle type="warning"
          @click="showBatchModal = true"
        >
          <template #icon><n-icon :component="FlashOutline" /></template>
        </n-button>

        <n-button secondary strong circle :type="isEditMode ? 'primary' : 'default'" @click="isEditMode = !isEditMode">
          <template #icon><n-icon :component="isEditMode ? CheckmarkOutline : CreateOutline" /></template>
        </n-button>
        <n-button type="primary" circle @click="handleAdd">
          <template #icon><n-icon :component="Add" /></template>
        </n-button>
      </div>
    </div>

    <div class="list-container">
      <n-spin :show="isLoading">
        <div v-if="sortedGroups.length === 0 && !isLoading" class="empty-state">
          <n-icon size="48" :component="SettingsOutline" color="#444" />
          <p>暂无数据</p>
        </div>

        <VueDraggable
          v-model="sortedGroups"
          :animation="350"
          handle=".cat-header" 
          :disabled="!isEditMode"
          ghostClass="ghost-cat"
          class="category-list"
          @start="onDragStart"
          @end="onCategoryDragEnd"
        >
          <div v-for="group in sortedGroups" :key="group.name" class="category-group">
            <div 
              class="cat-header" 
              :class="{ 'is-collapsed': group.collapsed, 'is-draggable': isEditMode }"
              @click="toggleCollapse(group)"
            >
              <div class="cat-info">
                <n-icon :component="group.collapsed ? ChevronForward : ChevronDown" color="#888" />
                <span class="cat-title">{{ group.name }} <span class="cat-count">({{ group.items.length }})</span></span>
              </div>
            </div>

            <div v-show="!group.collapsed" class="cat-content">
              <VueDraggable
                v-model="group.items"
                :group="group.name" 
                :animation="350"
                :swapThreshold="0.7"
                easing="cubic-bezier(0.25, 1, 0.5, 1)"
                :disabled="!isEditMode"
                ghostClass="ghost-item"
                dragClass="drag-active-item"
                class="card-grid"
                @start="onDragStart"
                @end="onItemDragEnd"
              >
                <div 
                  v-for="item in group.items" 
                  :key="item.id" 
                  class="card-wrapper"
                  :class="{ 'is-shaking': isDragging && isEditMode }"
                  :style="{ animationDelay: (isDragging && isEditMode) ? (Math.random() * -0.5 + 's') : '0s' }"
                >
                  <InventoryCard 
                    :item="item" 
                    :is-edit-mode="isEditMode"
                    :display-rule="categoryRules[item.category]" 
                    @update-qty="(delta) => handleQtyUpdate(item, delta)"
                    @delete="handleDelete(item.id)"
                    @edit="handleEdit(item)"
                  />
                </div>
              </VueDraggable>
            </div>
          </div>
        </VueDraggable>
      </n-spin>
    </div>

    <EditDialog v-model:show="showModal" :edit-data="currentEditItem" @refresh="onSaveSuccess" />
    
    <BatchEditModal 
      v-model:show="showBatchModal" 
      :all-inventory="allFlatItems"
      @refresh="onSaveSuccess"
    />

  </div>
</template>

<style scoped>
.inventory-page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  padding: 12px 16px; display: flex; gap: 12px; align-items: center;
  position: sticky; top: 0; z-index: 100;
  background: rgba(28, 28, 30, 0.85); backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.filter-group { display: flex; gap: 8px; width: 240px; }
.mini-select { flex: 1; }
.search-box { flex: 1; }
.tools { display: flex; gap: 12px; }

:deep(.n-input), :deep(.n-base-selection-label) {
  background-color: rgba(118, 118, 128, 0.24) !important; border: none !important; border-radius: 8px !important;
}

.list-container { flex: 1; overflow-y: auto; padding: 20px; }
.empty-state { text-align: center; color: #666; margin-top: 80px; }

.category-group { margin-bottom: 24px; }
.cat-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 8px; border-radius: 8px;
  cursor: pointer; user-select: none; transition: all 0.2s;
}
.cat-header.is-draggable:active { background: rgba(255,255,255,0.05); } 
.cat-header.is-collapsed { opacity: 0.6; }
.cat-info { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; color: #fff; }
.cat-count { font-size: 14px; color: #666; font-weight: normal; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
  gap: 16px; padding-top: 10px;
}
@media (max-width: 768px) { .card-grid { grid-template-columns: 1fr; } }

.card-wrapper { position: relative; transition: transform 0.2s; }
@keyframes jiggle { 0% { transform: rotate(0deg); } 25% { transform: rotate(-0.8deg); } 75% { transform: rotate(0.8deg); } 100% { transform: rotate(0deg); } }
.is-shaking { animation: jiggle 0.28s infinite ease-in-out; }

.drag-active-item {
  animation: none !important; transform: scale(1.05) !important;
  z-index: 1000 !important; cursor: grabbing;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5); border-radius: 16px;
  background: rgba(45, 45, 50, 0.95);
}

.ghost-item { opacity: 0; pointer-events: none; }
.ghost-cat { opacity: 0.2; background: rgba(255,255,255,0.1); border-radius: 8px; }
</style>