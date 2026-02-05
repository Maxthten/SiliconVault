<script setup lang="ts">
import { computed } from 'vue'
import { 
  Remove, Add, CreateOutline, TrashOutline, LocationOutline, 
  DocumentTextOutline, FolderOpenOutline 
} from '@vicons/ionicons5'
import { NIcon, NTag, NButton, NPopover, NCarousel, NDropdown } from 'naive-ui'

interface Props {
  item: any
  isEditMode?: boolean
  readOnly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['updateQty', 'delete', 'edit'])

// --- 1. 图片处理逻辑 ---

// 解析所有图片路径
const allImages = computed(() => {
  const raw = props.item.image_paths
  if (!raw) return []
  try {
    const paths = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(paths)) return []
    // 返回带协议的完整 URL 用于显示，以及原始路径用于打开
    return paths.map(p => ({
      url: `local-resource://${p}`,
      originalPath: p
    }))
  } catch (e) { return [] }
})

// 封面图 (第一张)
const coverImage = computed(() => allImages.value.length > 0 ? allImages.value[0].url : null)

// 打开系统图片查看器
const openSystemImage = (path: string) => {
  window.api.openFile(path)
}

// --- 2. 文档处理逻辑 ---

// 解析所有 PDF 路径
const allDocs = computed(() => {
  const raw = props.item.datasheet_paths
  if (!raw) return []
  try {
    const paths = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(paths)) return []
    return paths
  } catch (e) { return [] }
})

// 生成下拉菜单选项
const docOptions = computed(() => {
  return allDocs.value.map(path => ({
    label: path.replace(/^\d+_/, ''), // 去掉时间戳前缀，只显示文件名
    key: path,
    icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) })
  }))
})

// 处理文档点击
const handleDocSelect = (path: string) => {
  window.api.openFile(path)
}

// --- 3. 其他逻辑 ---

const getStockColor = (qty: number, min: number) => {
  if (qty <= 0) return '#FF453A' // 红
  if (qty < min) return '#FF9F0A' // 橙
  return '#30D158' // 绿
}

// 渲染函数 helper (用于 script 中使用 JSX/h 函数)
import { h } from 'vue'
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
      <div class="primary-row">
        <span class="value-text">{{ item.value || item.name }}</span>
        
        <NTag v-if="item.package" size="small" :bordered="false" class="pkg-tag">
          {{ item.package }}
        </NTag>
        
        <div v-if="allDocs.length > 0" class="doc-trigger">
          <NIcon 
            v-if="allDocs.length === 1" 
            :component="DocumentTextOutline" 
            class="pdf-icon clickable"
            @click.stop="handleDocSelect(allDocs[0])"
          />
          
          <NDropdown 
            v-else 
            trigger="click" 
            :options="docOptions" 
            @select="handleDocSelect"
          >
            <div class="multi-doc-icon clickable">
              <NIcon :component="FolderOpenOutline" />
              <span class="doc-count">{{ allDocs.length }}</span>
            </div>
          </NDropdown>
        </div>
      </div>

      <div class="secondary-row">
        <span v-if="item.value" class="name-text">{{ item.name }}</span>
        <span v-if="item.location" class="location-text">
          <n-icon :component="LocationOutline" /> {{ item.location }}
        </span>
      </div>
    </div>

    <div class="action-section">
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

/* 封面缩略图 */
.thumb-section {
  width: 48px; height: 48px; flex-shrink: 0;
  cursor: zoom-in; /* 提示可放大 */
}
.cover-wrapper {
  width: 100%; height: 100%; position: relative;
  border-radius: 8px; overflow: hidden;
  background: #000; border: 1px solid rgba(255,255,255,0.1);
}
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.count-badge {
  position: absolute; bottom: 0; right: 0;
  background: rgba(0,0,0,0.7); color: white;
  font-size: 9px; padding: 1px 4px;
  border-top-left-radius: 4px;
}

/* 悬浮预览层 */
.preview-popover { background: #000; }
.carousel-item { 
  width: 100%; height: 100%; position: relative; cursor: pointer; 
  display: flex; justify-content: center; align-items: center;
}
.carousel-img { 
  max-width: 100%; max-height: 100%; object-fit: contain; 
}
.carousel-hint {
  position: absolute; bottom: 10px; 
  background: rgba(0,0,0,0.6); color: white; 
  padding: 4px 12px; border-radius: 20px; font-size: 12px;
  opacity: 0; transition: opacity 0.3s;
}
.carousel-item:hover .carousel-hint { opacity: 1; }

/* 信息区域 */
.info-section {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  gap: 4px; overflow: hidden;
}
.primary-row { display: flex; align-items: center; gap: 8px; }
.value-text { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; }
.pkg-tag { background: rgba(255,255,255,0.1); color: #aaa; font-size: 10px; height: 18px; line-height: 18px; padding: 0 6px; border-radius: 4px; }

/* 文档图标 */
.clickable { cursor: pointer; transition: transform 0.2s; }
.clickable:hover { transform: scale(1.2); }
.pdf-icon { color: #ff4d4f; font-size: 18px; display: flex; align-items: center; }
.multi-doc-icon { 
  color: #409CFF; font-size: 18px; display: flex; align-items: center; gap: 2px;
}
.doc-count { font-size: 10px; font-weight: bold; margin-top: 2px; }

.secondary-row { display: flex; align-items: center; gap: 12px; min-height: 16px; }
.name-text { font-size: 13px; color: #888; }
.location-text { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; }

/* 操作区 */
.action-section { display: flex; align-items: center; }
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