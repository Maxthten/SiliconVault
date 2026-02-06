<script setup lang="ts">
import { computed, h } from 'vue'
import { 
  Remove, Add, CreateOutline, TrashOutline, LocationOutline, 
  DocumentTextOutline, FolderOpenOutline
} from '@vicons/ionicons5'
import { NIcon, NTag, NButton, NPopover, NCarousel, NDropdown } from 'naive-ui'

interface Props {
  item: any
  isEditMode?: boolean
  readOnly?: boolean
  // 接收显示规则，支持新版对象结构 { topLeft, topRight... } 或旧版数组
  displayRule?: {
    layout?: any 
    [key: string]: any
  }
}

const props = defineProps<Props>()
const emit = defineEmits(['updateQty', 'delete', 'edit'])

// --- 动态布局逻辑 (核心修复) ---

const layout = computed(() => {
  const raw = props.displayRule?.layout

  // 检查是否为新版对象配置
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    return {
      // 关键修复：使用三元运算符检查 undefined
      // 如果 raw.topLeft 是 "" (空字符串), 它不是 undefined, 所以会返回 "" (保持为空)
      // 之前的代码用 || 会导致 "" 变为 'value' (强行回退到默认值)
      tl: raw.topLeft !== undefined ? raw.topLeft : 'value',
      tr: raw.topRight !== undefined ? raw.topRight : 'package',
      bl: raw.bottomLeft !== undefined ? raw.bottomLeft : 'name',
      br: raw.bottomRight !== undefined ? raw.bottomRight : 'location'
    }
  }

  // 旧版数组兼容 (保持不变)
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

// --- 1. 图片处理逻辑 (保持不动) ---

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

// --- 2. 文档处理逻辑 (保持不动) ---

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

// --- 3. 样式逻辑 (保持不动) ---

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

/* 左侧缩略图 (保持不动) */
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

/* 中间布局重构：紧凑左对齐 */
.info-section {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  gap: 4px; overflow: hidden;
}

.info-row { 
  display: flex; 
  justify-content: flex-start; /* 左对齐 */
  align-items: center; 
  gap: 8px; /* 紧凑间距 8px */
}

/* 插槽容器 */
.slot-item { 
  display: flex; align-items: center; 
  max-width: 100%;
}

/* 字体与排版 */
.value-text { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name-text { font-size: 13px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-text { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 4px; }
.location-text { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; }

.pkg-tag { background: rgba(255,255,255,0.1); color: #aaa; font-size: 10px; height: 18px; line-height: 18px; padding: 0 6px; border-radius: 4px; }
.pkg-tag-large { font-size: 16px; font-weight: 700; color: #fff; }

/* 文档图标 (靠左对齐，紧跟前面的元素) */
.doc-trigger { display: flex; align-items: center; }
.clickable { cursor: pointer; transition: transform 0.2s; }
.clickable:hover { transform: scale(1.2); }
.pdf-icon { color: #ff4d4f; font-size: 18px; display: flex; align-items: center; }
.multi-doc-icon { color: #409CFF; font-size: 18px; display: flex; align-items: center; gap: 2px; }
.doc-count { font-size: 10px; font-weight: bold; margin-top: 2px; }

/* 右侧操作区 (保持不动) */
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