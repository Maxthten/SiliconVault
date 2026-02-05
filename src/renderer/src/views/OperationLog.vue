<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { 
  TimeOutline, 
  TrashOutline, 
  CreateOutline, 
  AddCircleOutline, 
  CubeOutline, 
  ReturnDownBackOutline, 
  InfiniteOutline,
  Search,
  ArrowUpOutline,
  ArrowDownOutline,
  CloudDownloadOutline,
  CloudUploadOutline
} from '@vicons/ionicons5'
import { NIcon, NSpin, useMessage, useDialog, NInput, NSelect } from 'naive-ui'

interface Log {
  id: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT'
  target_id: number
  desc: string
  old_data?: string
  new_data?: string
  created_at: string
}

// 状态管理
const logs = ref<Log[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const filterType = ref<string | null>(null)

const message = useMessage()
const dialog = useDialog()

// 筛选选项配置
const typeOptions: any[] = [
  { label: '全部操作', value: null },
  { label: '库存变动', value: 'STOCK' },
  { label: '新增元件', value: 'CREATE' },
  { label: '修改信息', value: 'UPDATE' },
  { label: '删除操作', value: 'DELETE' },
  { label: '批量导入', value: 'IMPORT' },
  { label: '数据导出', value: 'EXPORT' }
]

// 加载日志数据
const loadLogs = async () => {
  isLoading.value = true
  try {
    logs.value = await window.api.getLogs()
  } catch (e) {
    console.error(e)
    message.error('无法读取时光机日志')
  } finally {
    isLoading.value = false
  }
}

// 前端实时筛选逻辑
const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    // 筛选类型
    const matchType = !filterType.value || log.op_type === filterType.value
    // 搜索关键词 (忽略大小写)
    const matchSearch = !searchQuery.value || log.desc.toLowerCase().includes(searchQuery.value.toLowerCase())
    
    return matchType && matchSearch
  })
})

// 计算库存增量
const getStockDelta = (log: Log) => {
  if (log.op_type !== 'STOCK' || !log.old_data || !log.new_data) return null
  
  try {
    const oldQ = JSON.parse(log.old_data).quantity || 0
    const newQ = JSON.parse(log.new_data).quantity || 0
    const diff = newQ - oldQ
    
    if (diff > 0) return { val: `+${diff}`, type: 'up' }
    if (diff < 0) return { val: `${diff}`, type: 'down' }
    return null
  } catch (e) {
    return null
  }
}

// 撤销逻辑
const handleUndo = (log: Log) => {
  // 针对批量导入操作的安全拦截
  if (log.op_type === 'IMPORT') {
    message.warning('批量导入包含大量数据变更，不支持单步撤销')
    return
  }

  // 导出操作无数据变更，无需撤销
  if (log.op_type === 'EXPORT') {
    return
  }

  dialog.warning({
    title: '时光倒流',
    content: `确定要撤销 "${log.desc}" 吗？\n撤销后，数据将恢复到操作前的状态。`,
    positiveText: '立即撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.api.undoOperation(log.id)
        message.success('已成功撤销')
        loadLogs()
      } catch (e) {
        console.error(e)
        message.error('撤销失败：可能原数据依赖已丢失')
      }
    }
  })
}

// 格式化时间显示
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(/\//g, '-')
}

// 操作类型视觉配置
const getOpConfig = (type: string) => {
  switch (type) {
    case 'CREATE': return { icon: AddCircleOutline, color: '#30D158', label: '新增' }
    case 'DELETE': return { icon: TrashOutline, color: '#FF453A', label: '删除' }
    case 'UPDATE': return { icon: CreateOutline, color: '#0A84FF', label: '修改' }
    case 'STOCK':  return { icon: CubeOutline, color: '#FF9F0A', label: '库存' }
    case 'IMPORT': return { icon: CloudDownloadOutline, color: '#BF5AF2', label: '导入' }
    case 'EXPORT': return { icon: CloudUploadOutline, color: '#5E5CE6', label: '导出' }
    default:       return { icon: TimeOutline, color: '#888', label: '记录' }
  }
}

onMounted(() => { loadLogs() })
</script>

<template>
  <div class="log-page">
    
    <div class="toolbar">
      
      <div class="filter-group">
        <n-select 
          v-model:value="filterType" 
          :options="typeOptions" 
          placeholder="全部操作" 
          class="mini-select" 
          size="small" 
        />
      </div>

      <div class="search-box">
        <n-input 
          v-model:value="searchQuery" 
          placeholder="搜索操作记录..." 
          round clearable class="ios-search"
        >
          <template #prefix><n-icon :component="Search" /></template>
        </n-input>
      </div>

      <div class="title-badge">
        <n-icon :component="InfiniteOutline" />
        <span>时光机</span>
      </div>

    </div>

    <div class="content">
      <n-spin :show="isLoading">
        
        <div v-if="filteredLogs.length === 0 && !isLoading" class="empty-state">
          <n-icon size="64" :component="TimeOutline" color="#333" />
          <p>没有找到相关记录</p>
        </div>

        <div v-else class="timeline-list">
          <div class="timeline-line"></div>

          <div 
            v-for="(log, index) in filteredLogs" 
            :key="log.id" 
            class="timeline-item"
            :style="{ animationDelay: index * 0.03 + 's' }"
          >
            <div class="time-node">
              <div class="dot" :style="{ borderColor: getOpConfig(log.op_type).color }">
                <n-icon :component="getOpConfig(log.op_type).icon" :color="getOpConfig(log.op_type).color" size="14" />
              </div>
            </div>

            <div class="log-card">
              <div class="log-info">
                <div class="log-header">
                  <span class="op-tag" :style="{ color: getOpConfig(log.op_type).color, borderColor: getOpConfig(log.op_type).color }">
                    {{ getOpConfig(log.op_type).label }}
                  </span>
                  <span class="log-time">{{ formatTime(log.created_at) }}</span>
                </div>
                
                <div class="log-desc">{{ log.desc }}</div>
              </div>

              <div v-if="log.op_type === 'STOCK' && getStockDelta(log)" class="delta-display" :class="getStockDelta(log)?.type">
                <span class="delta-val">{{ getStockDelta(log)?.val }}</span>
                <n-icon :component="getStockDelta(log)?.type === 'up' ? ArrowUpOutline : ArrowDownOutline" />
              </div>

              <div 
                v-if="log.op_type !== 'IMPORT' && log.op_type !== 'EXPORT'" 
                class="log-action" 
                @click="handleUndo(log)"
              >
                <n-icon :component="ReturnDownBackOutline" />
              </div>
            </div>
          </div>
        </div>

      </n-spin>
    </div>
  </div>
</template>

<style scoped>
.log-page {
  height: 100vh;
  display: flex; flex-direction: column; 
  background: transparent; 
}

.toolbar {
  padding: 12px 16px; display: flex; gap: 12px; align-items: center;
  position: sticky; top: 0; z-index: 100;
  background: rgba(28, 28, 30, 0.85); backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.filter-group { width: 140px; flex-shrink: 0; }
.search-box { flex: 1; }
.title-badge { 
  display: flex; align-items: center; gap: 6px; 
  color: #0A84FF; font-weight: 800; font-size: 14px; 
  background: rgba(10, 132, 255, 0.1); padding: 4px 10px; border-radius: 12px;
}

:deep(.n-input), :deep(.n-base-selection-label) {
  background-color: rgba(118, 118, 128, 0.24) !important; border: none !important; border-radius: 8px !important;
}

.content { flex: 1; overflow-y: auto; padding: 20px 20px 100px 20px; }
.empty-state { margin-top: 100px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: #666; }

.timeline-list { position: relative; max-width: 800px; margin: 0 auto; }
.timeline-line { position: absolute; top: 10px; bottom: 0; left: 19px; width: 2px; background: rgba(255, 255, 255, 0.1); z-index: 0; }

.timeline-item {
  display: flex; gap: 16px; margin-bottom: 16px; position: relative; z-index: 1;
  animation: slideUp 0.3s ease-out backwards;
}

.time-node { flex-shrink: 0; width: 40px; display: flex; justify-content: center; }
.dot {
  width: 30px; height: 30px; background: #1c1c1e; border: 2px solid; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px rgba(0,0,0,0.5);
}

.log-card {
  flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  transition: all 0.2s;
}
.log-card:hover { background: rgba(255, 255, 255, 0.08); transform: translateY(-2px); }

.log-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.log-header { display: flex; align-items: center; gap: 8px; }

.op-tag {
  font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.05); border: 1px solid;
}
.log-time { font-size: 12px; color: #666; font-family: monospace; }
.log-desc { font-size: 14px; color: #ddd; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.delta-display {
  display: flex; align-items: center; font-weight: 800; font-size: 16px; gap: 2px;
}
.delta-display.up { color: #30D158; }
.delta-display.down { color: #FF453A; }

.log-action {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  color: #666; border-radius: 8px; cursor: pointer; transition: all 0.2s;
  background: rgba(255, 255, 255, 0.05);
}
.log-action:hover { color: #fff; background: rgba(255, 255, 255, 0.15); }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 768px) {
  .log-card { flex-wrap: wrap; }
  .log-info { min-width: 100%; }
  .delta-display { margin-left: auto; }
}
</style>