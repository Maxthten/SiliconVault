<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { 
  NModal, NCard, NInput, NForm, NFormItem, NButton, 
  NDivider, useMessage, NIcon 
} from 'naive-ui'
import { 
  LocationOutline, CubeOutline, 
  HardwareChipOutline, TextOutline 
} from '@vicons/ionicons5'
import { VueDraggable } from 'vue-draggable-plus'

const props = defineProps<{
  show: boolean
  category: string
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()

// 字段定义
const ALL_FIELDS = [
  { key: 'value', label: '核心数值', icon: TextOutline },
  { key: 'name', label: '型号/名称', icon: HardwareChipOutline },
  { key: 'package', label: '封装', icon: CubeOutline },
  { key: 'location', label: '位置', icon: LocationOutline }
]

// 表单数据
const form = ref({
  nameLabel: '', namePlaceholder: '',
  valueLabel: '', valuePlaceholder: '',
  packageLabel: '',
  layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' } as any 
})

// 拖拽状态管理
const poolList = ref<any[]>([])
const slotTopLeft = ref<any[]>([])
const slotTopRight = ref<any[]>([])
const slotBottomLeft = ref<any[]>([])
const slotBottomRight = ref<any[]>([])

// 监听插槽变化 (解决卡死问题的核心)
const onSlotAdd = (evt: any, slotRef: any) => {
  // 使用 nextTick 确保拖拽库完成内部处理后再修正数据
  nextTick(() => {
    if (slotRef.value.length > 1) {
      // 找出新拖入的元素（evt.newIndex 指向新元素位置）
      const newItem = slotRef.value[evt.newIndex]
      // 找出所有旧元素
      const oldItems = slotRef.value.filter((i: any) => i !== newItem)
      
      // 1. 更新插槽：只保留新的
      slotRef.value = [newItem]
      
      // 2. 将旧元素归还给池子 (防止重复添加)
      oldItems.forEach((item: any) => {
        const exists = poolList.value.some(p => p.key === item.key)
        // 还要检查它是否已经在其他插槽里（理论上单例模式不应该发生，但为了安全）
        if (!exists) {
          poolList.value.push(item)
        }
      })
    }
  })
}

// 也就是当从插槽拖回池子时，不用特殊处理，VueDraggable 会自动处理
// 但我们需要确保池子的 group 设置正确

// 初始化布局
watch(() => props.show, async (val) => {
  if (val && props.category) {
    try {
      const rule = await window.api.getCategoryRule(props.category)
      form.value = { 
        layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' },
        ...rule 
      }
      
      let layout = form.value.layout
      if (Array.isArray(layout)) {
        layout = {
          topLeft: layout[0] || 'value',
          topRight: 'package',
          bottomLeft: layout[1] || 'name',
          bottomRight: 'location'
        }
      }

      const usedKeys = new Set([layout.topLeft, layout.topRight, layout.bottomLeft, layout.bottomRight])
      
      // 过滤掉空key，确保插槽被正确填充或留空
      slotTopLeft.value = ALL_FIELDS.filter(f => f.key === layout.topLeft)
      slotTopRight.value = ALL_FIELDS.filter(f => f.key === layout.topRight)
      slotBottomLeft.value = ALL_FIELDS.filter(f => f.key === layout.bottomLeft)
      slotBottomRight.value = ALL_FIELDS.filter(f => f.key === layout.bottomRight)

      poolList.value = ALL_FIELDS.filter(f => !usedKeys.has(f.key))

    } catch (e) {
      console.error(e)
      message.error('加载配置失败')
    }
  }
})

const handleSave = async () => {
  const newLayout = {
    topLeft: slotTopLeft.value[0]?.key || '',
    topRight: slotTopRight.value[0]?.key || '',
    bottomLeft: slotBottomLeft.value[0]?.key || '',
    bottomRight: slotBottomRight.value[0]?.key || ''
  }

  if (!newLayout.topLeft && !newLayout.bottomLeft && !newLayout.topRight && !newLayout.bottomRight) {
    message.warning('卡片不能完全为空')
    return
  }

  form.value.layout = newLayout
  const payload = JSON.parse(JSON.stringify(form.value))
  
  try {
    await window.api.saveCategoryRule(props.category, payload)
    message.success(`已更新 [${props.category}] 布局`)
    emit('update:show', false)
    emit('refresh')
  } catch (e: any) {
    message.error(`保存失败: ${e.message}`)
  }
}

const handleReset = async () => {
  try {
    await window.api.resetCategoryRule(props.category)
    message.success('已恢复默认设置')
    emit('update:show', false)
    emit('refresh')
  } catch (e) { message.error('重置失败') }
}

const getFieldLabel = (key: string) => {
  const def = ALL_FIELDS.find(f => f.key === key)
  return def ? def.label : ''
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card 
      :title="`🛠️ 布局配置: ${category}`" 
      class="rule-modal" 
      :bordered="false" 
      role="dialog" 
      aria-modal="true"
    >
      
      <div class="layout-editor">
        
        <div class="field-pool">
          <div class="pool-header">
            <span class="pool-title">可用字段</span>
            <span class="pool-hint">拖拽放入右侧</span>
          </div>
          <VueDraggable
            v-model="poolList"
            :group="{ name: 'fields', put: true }" 
            :animation="200"
            ghost-class="ghost-pool"
            class="pool-list"
          >
            <div v-for="item in poolList" :key="item.key" class="field-chip">
              <n-icon :component="item.icon" class="chip-icon"/>
              <span>{{ item.label }}</span>
            </div>
            <div v-if="poolList.length === 0" class="empty-msg">已全部使用</div>
          </VueDraggable>
        </div>

        <div class="simulator-container">
          <div class="sim-header">卡片布局预览 (2x2 网格)</div>
          
          <div class="grid-card">
            
            <div class="grid-cell cell-tl">
              <VueDraggable
                v-model="slotTopLeft"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotTopLeft)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotTopLeft.length > 0" class="slotted-content primary">
                  {{ getFieldLabel(slotTopLeft[0].key) }}
                </div>
                <div v-else class="placeholder">主标题</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-tr">
              <VueDraggable
                v-model="slotTopRight"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotTopRight)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotTopRight.length > 0" class="slotted-content tag">
                  {{ getFieldLabel(slotTopRight[0].key) }}
                </div>
                <div v-else class="placeholder">标签</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-bl">
              <VueDraggable
                v-model="slotBottomLeft"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotBottomLeft)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotBottomLeft.length > 0" class="slotted-content secondary">
                  {{ getFieldLabel(slotBottomLeft[0].key) }}
                </div>
                <div v-else class="placeholder">副标题</div>
              </VueDraggable>
            </div>

            <div class="grid-cell cell-br">
              <VueDraggable
                v-model="slotBottomRight"
                :group="{ name: 'fields', put: true }"
                @add="(e) => onSlotAdd(e, slotBottomRight)"
                class="drop-area"
                ghost-class="ghost-slot"
              >
                <div v-if="slotBottomRight.length > 0" class="slotted-content meta">
                  {{ getFieldLabel(slotBottomRight[0].key) }}
                </div>
                <div v-else class="placeholder">附注</div>
              </VueDraggable>
            </div>

          </div>
        </div>
      </div>

      <n-divider />

      <n-form size="small" label-placement="left" label-width="80" class="main-form">
        <n-divider title-placement="left">字段名称重命名 (可选)</n-divider>
        <div class="form-grid">
          <n-form-item label="Value名称">
            <n-input v-model:value="form.valueLabel" placeholder="默认: 核心数值" />
          </n-form-item>
          <n-form-item label="Name名称">
            <n-input v-model:value="form.nameLabel" placeholder="默认: 型号/名称" />
          </n-form-item>
          <n-form-item label="Package名称">
            <n-input v-model:value="form.packageLabel" placeholder="默认: 封装" />
          </n-form-item>
        </div>
      </n-form>

      <template #footer>
        <div class="footer">
          <n-button type="warning" ghost @click="handleReset">↺ 恢复默认</n-button>
          
          <div class="right-btns">
            <n-button @click="emit('update:show', false)">取消</n-button>
            <n-button type="primary" @click="handleSave">应用配置</n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.rule-modal { 
  width: 620px; 
  background-color: #1c1c1e; 
  border-radius: 16px; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.6);
}

.layout-editor {
  display: flex; gap: 20px; height: 220px;
}

/* 左侧池子 */
.field-pool {
  width: 160px;
  background: rgba(255,255,255,0.03);
  border-radius: 12px;
  padding: 12px;
  display: flex; flex-direction: column;
}
.pool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pool-title { font-size: 13px; font-weight: 600; color: #fff; }
.pool-hint { font-size: 11px; color: #666; }

.pool-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.field-chip {
  background: #2c2c2e; border: 1px solid #3a3a3c;
  padding: 8px 10px; border-radius: 8px;
  font-size: 12px; color: #ddd;
  display: flex; align-items: center; gap: 8px;
  cursor: grab; user-select: none;
  transition: all 0.2s;
}
.field-chip:hover { border-color: #555; background: #333; }
.chip-icon { font-size: 14px; color: #0A84FF; }
.empty-msg { text-align: center; color: #444; font-size: 12px; margin-top: 20px; }

/* 右侧模拟器 */
.simulator-container { flex: 1; display: flex; flex-direction: column; }
.sim-header { font-size: 13px; color: #888; margin-bottom: 10px; text-align: center; }

/* --- 核心：CSS Grid 布局 --- */
.grid-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;
  
  display: grid;
  grid-template-columns: 1fr 100px; /* 左列自适应，右列固定 */
  grid-template-rows: 1fr 1fr;      /* 上下两行等高 */
  gap: 12px;                        /* 网格间距 */
}

.grid-cell {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0,0,0,0.2);
  border: 1px dashed rgba(255,255,255,0.15);
  transition: border-color 0.2s;
}
.grid-cell:hover { border-color: #0A84FF; }

/* 拖拽区域撑满格子 */
.drop-area { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

/* 占位符文字 */
.placeholder { font-size: 11px; color: #555; pointer-events: none; user-select: none; }

/* 已填充内容的样式 */
.slotted-content {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #fff; background: #0A84FF;
  cursor: grab;
}
.slotted-content.primary { font-weight: bold; font-size: 15px; background: #0A84FF; }
.slotted-content.secondary { background: rgba(10, 132, 255, 0.2); color: #88bfff; }
.slotted-content.tag { background: rgba(255,255,255,0.15); color: #ddd; border-radius: 4px; margin: 4px; height: auto; padding: 4px 0; }
.slotted-content.meta { background: transparent; color: #888; border: 1px solid #444; }

/* 拖拽中的幽灵样式 */
.ghost-pool { opacity: 0.4; background: #0A84FF; border: 1px dashed #fff; }
.ghost-slot { opacity: 0.5; background: #0A84FF; border-radius: 8px; }

/* 底部表单 */
.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
:deep(.n-divider__title) { color: #666; font-size: 12px; }
.footer { display: flex; justify-content: space-between; margin-top: 16px; }
.right-btns { display: flex; gap: 10px; }
</style>