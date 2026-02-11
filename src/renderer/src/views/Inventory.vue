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
import { ref, onMounted, watch, computed } from 'vue'
import { 
  Search, Add, CreateOutline, CheckmarkOutline, 
  ChevronDown, ChevronForward, FlashOutline, SettingsOutline
} from '@vicons/ionicons5'
import { NInput, NButton, NIcon, NSpin, NSelect, useDialog } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import InventoryCard from '../components/InventoryCard.vue'
import EditDialog from '../components/EditDialog.vue'
import BatchEditModal from '../components/BatchEditModal.vue'
import { useI18n } from '../utils/i18n'
import { useI18nMessage } from '../utils/message'

const { t } = useI18n()
const { success, error } = useI18nMessage()
const dialog = useDialog()

// 映射表：用于在视觉上合并新旧数据
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
  } catch (e) { console.error(e) }
}

const loadPackages = async () => {
  try {
    const pkgs = await window.api.fetchPackages(filterCategory.value || undefined)
    packageOptions.value = [{ label: t('inventory.allPackages'), value: null }, ...pkgs.map(p => ({ label: p, value: p }))]
  } catch (e) { console.error(e) }
}

// 改造后的分类加载：实现中英文视觉合并
const loadOptions = async () => {
  try {
    const cats = await window.api.fetchCategories()
    
    const mergedMap = new Map<string, { label: string, value: string }>()

    cats.forEach((rawCat: string) => {
      const canonicalKey = LEGACY_MAP[rawCat] || rawCat
      const transKey = `categories.${canonicalKey}`
      const translated = t(transKey)
      const displayLabel = translated !== transKey ? translated : rawCat

      if (mergedMap.has(displayLabel)) {
        // 如果当前是旧数据格式，优先保留旧数据值，防止筛选失效
        if (LEGACY_MAP[rawCat]) {
          mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
        }
      } else {
        mergedMap.set(displayLabel, { label: displayLabel, value: rawCat })
      }
    })

    const mergedOptions = Array.from(mergedMap.values())
    // 保持一定的排序 (可选)
    mergedOptions.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))

    categoryOptions.value = [{ label: t('inventory.allCategories'), value: null }, ...mergedOptions]
    
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
    
    // 改造：分组展示时的视觉合并逻辑
    // 即使数据库里是分开的 "Resistor" 和 "电阻"，在界面上也合并到同一个 Header 下
    const mergedGroups = new Map<string, any[]>()

    Object.entries(data).forEach(([rawCat, items]) => {
      const canonicalKey = LEGACY_MAP[rawCat] || rawCat
      const transKey = `categories.${canonicalKey}`
      const translated = t(transKey)
      const displayLabel = translated !== transKey ? translated : rawCat

      if (!mergedGroups.has(displayLabel)) {
        mergedGroups.set(displayLabel, [])
      }
      mergedGroups.get(displayLabel)!.push(...items)
    })

    sortedGroups.value = Array.from(mergedGroups.entries()).map(([catName, items]) => ({
      name: catName,
      collapsed: oldStateMap.get(catName) || false,
      items: items
    }))

  } catch (err) {
    error('loadFailed')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

watch(() => t('common.save'), () => {
  loadOptions()
  loadData() // 语言切换时刷新列表标题
})

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
    title: t('common.delete'), 
    content: t('inventory.deleteConfirm'), 
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.api.deleteItem(id)
        success('deleted') 
        loadData()
        loadOptions()
      } catch (e: any) {
        if (e.message && e.message.includes('无法删除')) {
          dialog.error({
            title: t('messages.warning.title'), 
            content: e.message, 
            positiveText: t('common.confirm')
          })
        } else {
          error('deleteFailed')
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
        <n-select v-model:value="filterCategory" :options="categoryOptions" :placeholder="t('inventory.category')" class="mini-select" size="small" />
        <n-select v-model:value="filterPackage" :options="packageOptions" :placeholder="t('inventory.package')" class="mini-select" size="small" />
      </div>

      <div class="search-box">
        <n-input v-model:value="searchQuery" :placeholder="t('common.search') + '...'" round clearable class="ios-search">
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
          <n-icon size="48" :component="SettingsOutline" class="empty-icon" />
          <p>{{ t('common.noData') }}</p>
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
                <n-icon :component="group.collapsed ? ChevronForward : ChevronDown" class="cat-arrow" />
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
/* 样式保持不变 */
.inventory-page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  padding: 12px 16px; display: flex; gap: 12px; align-items: center;
  position: sticky; top: 0; z-index: 100;
  background: var(--bg-sidebar); 
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-main);
}
.filter-group { display: flex; gap: 8px; width: 240px; }
.mini-select { flex: 1; }
.search-box { flex: 1; }
.tools { display: flex; gap: 12px; }

:deep(.n-input .n-input__input-el),
:deep(.n-base-selection-label) {
  color: var(--text-primary) !important;
  caret-color: var(--text-primary);
}

:deep(.n-input .n-input__placeholder),
:deep(.n-base-selection-placeholder) {
  color: var(--text-tertiary) !important;
}

:deep(.n-input), :deep(.n-base-selection-label) {
  background-color: rgba(118, 118, 128, 0.24) !important; 
  border: 1px solid transparent !important; 
  border-radius: 8px !important;
}

:global([data-theme="light"]) .toolbar :deep(.n-input),
:global([data-theme="light"]) .toolbar :deep(.n-base-selection-label) {
  background-color: rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

:global([data-theme="light"]) .toolbar :deep(.n-input:hover),
:global([data-theme="light"]) .toolbar :deep(.n-input:focus-within) {
  background-color: rgba(0, 0, 0, 0.12) !important;
}

.list-container { flex: 1; overflow-y: auto; padding: 20px; }
.empty-state { text-align: center; color: var(--text-tertiary); margin-top: 80px; }
.empty-icon { color: var(--text-tertiary); }

.category-group { margin-bottom: 24px; }
.cat-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 8px; border-radius: 8px;
  cursor: pointer; user-select: none; transition: all 0.2s;
}
.cat-header.is-draggable:active { background: var(--border-hover); } 
.cat-header.is-collapsed { opacity: 0.6; }

.cat-info { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; color: var(--text-primary); }
.cat-count { font-size: 14px; color: var(--text-tertiary); font-weight: normal; }
.cat-arrow { color: var(--text-tertiary); }

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
  background: var(--bg-card);
  color: var(--text-primary);
}

.ghost-item { opacity: 0; pointer-events: none; }
.ghost-cat { opacity: 0.2; background: var(--border-main); border-radius: 8px; }
</style>