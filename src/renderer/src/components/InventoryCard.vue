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
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Remove, Add, CreateOutline, TrashOutline, LocationOutline, 
  DocumentTextOutline, FolderOpenOutline, LinkOutline, ArrowForward
} from '@vicons/ionicons5'
import { NIcon, NTag, NButton, NPopover, NCarousel, NDropdown, NSpin } from 'naive-ui'

interface Props {
  item: any
  isEditMode?: boolean
  readOnly?: boolean
  displayRule?: {
    layout?: any 
    [key: string]: any
  }
}

const props = defineProps<Props>()
const emit = defineEmits(['updateQty', 'delete', 'edit'])
const router = useRouter()

// --- 动态布局逻辑 ---

const layout = computed(() => {
  const raw = props.displayRule?.layout

  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    return {
      tl: raw.topLeft !== undefined ? raw.topLeft : 'value',
      tr: raw.topRight !== undefined ? raw.topRight : 'package',
      bl: raw.bottomLeft !== undefined ? raw.bottomLeft : 'name',
      br: raw.bottomRight !== undefined ? raw.bottomRight : 'location'
    }
  }

  const arr = Array.isArray(raw) ? raw : ['value', 'name']
  return {
    tl: arr[0] || 'value',
    tr: 'package',     
    bl: arr[1] || 'name',
    br: 'location'     
  }
})

const getFieldContent = (key: string) => {
  if (!key) return ''
  return props.item[key]
}

// --- 1. 图片处理逻辑 ---

const allImages = computed(() => {
  const raw = props.item.image_paths
  if (!raw) return []
  try {
    const paths = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(paths)) return []
    return paths.map(p => ({
      url: `local-resource://${p}`,
      originalPath: p
    }))
  } catch (e) { return [] }
})

const coverImage = computed(() => allImages.value.length > 0 ? allImages.value[0].url : null)

const openSystemImage = (path: string) => {
  window.api.openFile(path)
}

// --- 2. 文档处理逻辑 ---

const allDocs = computed(() => {
  const raw = props.item.datasheet_paths
  if (!raw) return []
  try {
    const paths = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(paths)) return []
    return paths
  } catch (e) { return [] }
})

const docOptions = computed(() => {
  return allDocs.value.map(path => ({
    label: path.replace(/^\d+_/, ''),
    key: path,
    icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) })
  }))
})

const handleDocSelect = (path: string) => {
  window.api.openFile(path)
}

// --- 3. 关联项目逻辑 ---

const relatedProjects = ref<Array<{ id: number, name: string }>>([])
const isLoadingRelated = ref(false)
const hasLoadedRelated = ref(false)

const handleRefMouseEnter = async () => {
  if (props.item.ref_count > 0 && !hasLoadedRelated.value) {
    isLoadingRelated.value = true
    try {
      relatedProjects.value = await window.api.getRelatedProjects(props.item.id)
      hasLoadedRelated.value = true
    } catch (e) {
      console.error(e)
    } finally {
      isLoadingRelated.value = false
    }
  }
}

// 跳转到 BOM 页面并过滤 ID
const navigateToProject = (proj: { id: number, name: string }) => {
  router.push({ 
    name: 'Bom', 
    query: { ids: String(proj.id) } 
  })
}

// 跳转到 BOM 页面并过滤 ID 列表
const navigateToAllRefs = () => {
  const ids = relatedProjects.value.map(p => p.id).join(',')
  router.push({ 
    name: 'Bom', 
    query: { ids: ids } 
  })
}

// --- 4. 样式逻辑 ---

const getStockColor = (qty: number, min: number) => {
  if (qty <= 0) return '#FF453A' 
  if (qty < min) return '#FF9F0A'
  return '#30D158'
}
</script>

<template>
  <div class="card" :class="{ 'has-cover': !!coverImage }">
    
    <div v-if="coverImage" class="thumb-section">
      <n-popover 
        trigger="hover" 
        placement="right-start" 
        style="padding: 0; border-radius: 12px; overflow: hidden;"
        :show-arrow="false"
      >
        <template #trigger>
          <div class="cover-wrapper">
            <img :src="coverImage" loading="lazy" class="cover-img" />
            <div v-if="allImages.length > 1" class="count-badge">
              {{ allImages.length }}
            </div>
          </div>
        </template>

        <div class="preview-popover">
          <n-carousel show-arrow autoplay style="width: 280px; height: 280px">
            <div 
              v-for="(img, index) in allImages" 
              :key="index" 
              class="carousel-item"
              @click="openSystemImage(img.originalPath)"
            >
              <img :src="img.url" class="carousel-img" />
              <div class="carousel-hint">点击打开原图</div>
            </div>
          </n-carousel>
        </div>
      </n-popover>
    </div>

    <div class="info-section">
      
      <div class="info-row primary">
        
        <div class="slot-item" v-if="layout.tl">
          <span v-if="layout.tl === 'package'" class="pkg-tag-large">{{ item.package }}</span>
          <span v-else class="value-text">{{ getFieldContent(layout.tl) }}</span>
        </div>

        <div class="slot-item" v-if="layout.tr">
          <NTag v-if="layout.tr === 'package' && item.package" size="small" :bordered="false" class="pkg-tag">
            {{ item.package }}
          </NTag>
          
          <span v-else-if="layout.tr === 'location' && item.location" class="meta-text">
            <n-icon :component="LocationOutline" /> {{ item.location }}
          </span>

          <span v-else class="meta-text">{{ getFieldContent(layout.tr) }}</span>
        </div>

        <div v-if="allDocs.length > 0" class="doc-trigger">
          <NIcon 
            v-if="allDocs.length === 1" 
            :component="DocumentTextOutline" 
            class="pdf-icon clickable"
            @click.stop="handleDocSelect(allDocs[0])"
          />
          <NDropdown v-else trigger="click" :options="docOptions" @select="handleDocSelect">
            <div class="multi-doc-icon clickable">
              <NIcon :component="FolderOpenOutline" />
              <span class="doc-count">{{ allDocs.length }}</span>
            </div>
          </NDropdown>
        </div>

      </div>

      <div class="info-row secondary">
        
        <div class="slot-item" v-if="layout.bl">
          <span class="name-text">{{ getFieldContent(layout.bl) }}</span>
        </div>

        <div class="slot-item" v-if="layout.br">
           <NTag v-if="layout.br === 'package' && item.package" size="small" :bordered="false" class="pkg-tag">
            {{ item.package }}
          </NTag>

          <span v-else-if="layout.br === 'location' && item.location" class="location-text">
            <n-icon :component="LocationOutline" /> {{ item.location }}
          </span>

          <span v-else class="location-text">{{ getFieldContent(layout.br) }}</span>
        </div>
      </div>
    </div>

    <div class="action-section">
      <n-popover 
        v-if="item.ref_count > 0" 
        trigger="hover" 
        placement="bottom-end" 
        raw
        :show-arrow="false"
        @update:show="(show) => show && handleRefMouseEnter()"
      >
        <template #trigger>
          <div class="ref-badge clickable">
            <n-icon :component="LinkOutline" />
            <span class="ref-count">{{ item.ref_count }}</span>
          </div>
        </template>
        
        <div class="ref-popover-content matte-effect">
          <div class="ref-header">
            <span>关联项目</span>
            <span class="ref-total">{{ item.ref_count }}</span>
          </div>
          
          <div v-if="isLoadingRelated" class="ref-loading">
            <n-spin size="small" />
          </div>
          
          <div v-else class="ref-list">
            <div 
              v-for="proj in relatedProjects" 
              :key="proj.id" 
              class="ref-item"
              @click="navigateToProject(proj)"
            >
              <span class="proj-name">{{ proj.name }}</span>
              <n-icon :component="ArrowForward" class="arrow-icon" />
            </div>
          </div>

          <div v-if="!isLoadingRelated && relatedProjects.length > 0" class="ref-footer" @click="navigateToAllRefs">
            <span>查看全部筛选</span>
          </div>
        </div>
      </n-popover>

      <div v-if="!isEditMode" class="qty-control" :class="{ 'is-readonly': readOnly }">
        <n-button v-if="!readOnly" circle size="small" secondary class="qty-btn" @click.stop="emit('updateQty', -1)">
          <template #icon><n-icon :component="Remove" /></template>
        </n-button>
        
        <div class="qty-display" :style="{ color: getStockColor(item.quantity, item.min_stock) }">
          {{ item.quantity }}
        </div>
        
        <n-button v-if="!readOnly" circle size="small" secondary class="qty-btn" @click.stop="emit('updateQty', 1)">
          <template #icon><n-icon :component="Add" /></template>
        </n-button>
      </div>

      <div v-else class="manage-control">
        <n-button circle size="small" secondary @click.stop="emit('edit')">
          <template #icon><n-icon :component="CreateOutline" /></template>
        </n-button>
        <n-button circle size="small" secondary type="error" @click.stop="emit('delete')">
          <template #icon><n-icon :component="TrashOutline" /></template>
        </n-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 72px; 
  box-sizing: border-box;
  gap: 16px;
  transition: background 0.2s;
}
.card:hover { background: rgba(255, 255, 255, 0.08); }

/* 左侧缩略图 */
.thumb-section { width: 48px; height: 48px; flex-shrink: 0; cursor: zoom-in; }
.cover-wrapper {
  width: 100%; height: 100%; position: relative;
  border-radius: 8px; overflow: hidden;
  background: #000; border: 1px solid rgba(255,255,255,0.1);
}
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.count-badge {
  position: absolute; bottom: 0; right: 0;
  background: rgba(0,0,0,0.7); color: white;
  font-size: 9px; padding: 1px 4px; border-top-left-radius: 4px;
}
.preview-popover { background: #000; }
.carousel-item { 
  width: 100%; height: 100%; position: relative; cursor: pointer; 
  display: flex; justify-content: center; align-items: center;
}
.carousel-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.carousel-hint {
  position: absolute; bottom: 10px; background: rgba(0,0,0,0.6); color: white; 
  padding: 4px 12px; border-radius: 20px; font-size: 12px; opacity: 0; transition: opacity 0.3s;
}
.carousel-item:hover .carousel-hint { opacity: 1; }

/* 中间布局 */
.info-section {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  gap: 4px; overflow: hidden;
}

.info-row { 
  display: flex; justify-content: flex-start; align-items: center; gap: 8px; 
}

.slot-item { display: flex; align-items: center; max-width: 100%; }

.value-text { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name-text { font-size: 13px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-text { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 4px; }
.location-text { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; }

.pkg-tag { background: rgba(255,255,255,0.1); color: #aaa; font-size: 10px; height: 18px; line-height: 18px; padding: 0 6px; border-radius: 4px; }
.pkg-tag-large { font-size: 16px; font-weight: 700; color: #fff; }

.doc-trigger { display: flex; align-items: center; }
.clickable { cursor: pointer; transition: transform 0.2s; }
.clickable:hover { transform: scale(1.1); }
.pdf-icon { color: #ff4d4f; font-size: 18px; display: flex; align-items: center; }
.multi-doc-icon { color: #409CFF; font-size: 18px; display: flex; align-items: center; gap: 2px; }
.doc-count { font-size: 10px; font-weight: bold; margin-top: 2px; }

/* 右侧操作区 */
.action-section { display: flex; align-items: center; gap: 12px; }

/* 关联项目胶囊样式 */
.ref-badge {
  display: flex; align-items: center; gap: 4px;
  background: rgba(10, 132, 255, 0.15);
  padding: 4px 8px;
  border-radius: 12px;
  color: #0A84FF;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}
.ref-badge:hover { background: rgba(10, 132, 255, 0.25); }

/* --- 🌟 哑光悬浮卡片样式 (Matte Floating) --- */
.ref-popover-content { 
  width: 220px; 
  /* 哑光深黑背景，不透明 */
  background: #1C1C1E; 
  
  /* 极细微光描边 */
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  
  /* 柔和弥散投影 */
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  color: #EBEBF5; /* iOS 标准文本色 */
}

.ref-header {
  padding: 12px 16px; 
  /* 移除边框，保留间距 */
  border-bottom: 1px solid transparent;
  font-size: 12px; 
  font-weight: 600;
  color: rgba(235, 235, 245, 0.6); 
  display: flex; 
  justify-content: space-between;
  align-items: center;
}

.ref-total { 
  background: rgba(255, 255, 255, 0.1); 
  padding: 2px 8px; 
  border-radius: 10px; 
  color: #fff; 
  font-size: 11px;
}

.ref-loading { padding: 20px; display: flex; justify-content: center; }

.ref-list { 
  max-height: 200px; 
  overflow-y: auto; 
  margin: 2px 4px; /* 留出边距，让悬停块不贴边 */
}

.ref-list::-webkit-scrollbar { width: 4px; }
.ref-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.ref-item {
  padding: 10px 12px; 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  cursor: pointer; 
  transition: all 0.1s; 
  border-radius: 8px; /* 圆角悬停块 */
  margin-bottom: 2px;
}

/* 悬停交互：整齐的浅灰色块 */
.ref-item:hover { 
  background: rgba(255, 255, 255, 0.06); 
}

.proj-name { 
  font-size: 13px; 
  color: #EBEBF5; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  max-width: 150px; 
}

.arrow-icon { 
  font-size: 14px; 
  color: rgba(235, 235, 245, 0.3); 
}

.ref-footer {
  padding: 12px; 
  text-align: center; 
  color: #0A84FF; 
  font-size: 12px; 
  font-weight: 600;
  cursor: pointer; 
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 4px;
}

.ref-footer:hover { 
  background: rgba(255, 255, 255, 0.03); 
}

.qty-control {
  display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.2); padding: 4px; border-radius: 20px;
  transition: all 0.2s;
}
.qty-control.is-readonly { background: transparent; padding: 0; }
.qty-display { font-size: 16px; font-weight: bold; min-width: 24px; text-align: center; }
.qty-btn { width: 28px; height: 28px; }
.manage-control { display: flex; gap: 10px; }
</style>