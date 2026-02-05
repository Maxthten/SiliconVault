<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  NModal, NCard, NButton, NIcon, NTabs, NTabPane, 
  NScrollbar, useMessage 
} from 'naive-ui'
import { 
  AlertCircleOutline, ArrowForward, CopyOutline, 
  CloseCircleOutline, CubeOutline, LayersOutline, TimeOutline,
  ImageOutline
} from '@vicons/ionicons5'

import type { ScanResult, ImportStrategy } from '../../../preload/index'

const props = defineProps<{
  show: boolean
  scanResult: ScanResult | null
}>()

const emit = defineEmits(['update:show', 'confirm'])
const message = useMessage()

const activeTab = ref<'inventory' | 'projects'>('inventory')
const isImporting = ref(false)

const inventoryDecisions = ref<Record<number, ImportStrategy>>({})
const projectDecisions = ref<Record<number, ImportStrategy>>({})

const currentBatchMode = computed(() => {
  if (!props.scanResult) return { inventory: null, projects: null }

  const checkUniformity = (type: 'inventory' | 'projects') => {
    const decisions = type === 'inventory' ? inventoryDecisions.value : projectDecisions.value
    const conflicts = props.scanResult!.conflicts[type]
    
    if (conflicts.length === 0) return null
    
    const firstId = conflicts[0].remote.id
    if (!firstId) return null

    const firstStrategy = decisions[firstId]
    const isUniform = conflicts.every(c => c.remote.id && decisions[c.remote.id] === firstStrategy)
    
    return isUniform ? firstStrategy : null
  }

  return {
    inventory: checkUniformity('inventory'),
    projects: checkUniformity('projects')
  }
})

watch(() => props.scanResult, (val) => {
  if (val) {
    inventoryDecisions.value = {}
    projectDecisions.value = {}
    
    val.conflicts.inventory.forEach(c => {
      if (c.remote.id) inventoryDecisions.value[c.remote.id] = 'keep_both'
    })
    val.conflicts.projects.forEach(c => {
      if (c.remote.id) projectDecisions.value[c.remote.id] = 'keep_both'
    })
  }
}, { immediate: true })

const applyToAll = (type: 'inventory' | 'projects', strategy: ImportStrategy) => {
  if (!props.scanResult) return
  const target = type === 'inventory' ? inventoryDecisions.value : projectDecisions.value
  const conflicts = props.scanResult.conflicts[type]
  
  conflicts.forEach(c => {
    if (c.remote.id) target[c.remote.id] = strategy
  })
}

const formatDate = (ts?: string | number) => {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString()
}

const handleConfirm = async () => {
  if (!props.scanResult) return
  isImporting.value = true
  
  try {
    const rawInventoryStrategies = JSON.parse(JSON.stringify(inventoryDecisions.value))
    const rawProjectStrategies = JSON.parse(JSON.stringify(projectDecisions.value))

    const strategies = {
      inventory: rawInventoryStrategies,
      projects: rawProjectStrategies
    }
    
    const res = await window.api.executeImportBundle(props.scanResult.scanId, strategies)
    
    if (res.success) {
      message.success('资源包导入完成')
      emit('update:show', false)
      emit('confirm') 
    }
  } catch (e: any) {
    console.error('前端捕获到导入错误:', e)
    message.error('导入失败: ' + (e.message || '未知错误'))
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <n-modal 
    :show="show" 
    :mask-closable="false"
    @update:show="(v) => !isImporting && emit('update:show', v)"
    transform-origin="center"
  >
    <n-card class="conflict-modal" :bordered="false" role="dialog" aria-modal="true">
      
      <div class="modal-header">
        <div class="header-title">
          <n-icon size="24" :component="AlertCircleOutline" color="#FF9F0A" />
          <span>冲突解决向导</span>
        </div>
        <div class="header-summary" v-if="scanResult">
          检测到 <strong class="highlight">{{ scanResult.conflicts.inventory.length + scanResult.conflicts.projects.length }}</strong> 个冲突项，
          <span class="new-item-text">另有 {{ scanResult.newItems.inventory + scanResult.newItems.projects }} 个新项将自动导入。</span>
        </div>
      </div>

      <div class="modal-content" v-if="scanResult">
        <n-tabs type="segment" v-model:value="activeTab">
          
          <n-tab-pane name="inventory" tab="库存冲突">
            <div class="conflict-list">
              <div v-if="scanResult.conflicts.inventory.length === 0" class="empty-state">
                <p>无库存冲突</p>
              </div>

              <div class="batch-bar" v-else>
                <span>批量操作：</span>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'keep_both' ? 'primary' : 'default'"
                  @click="applyToAll('inventory', 'keep_both')"
                >
                  全部保留副本
                </n-button>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'skip' ? 'primary' : 'default'"
                  @click="applyToAll('inventory', 'skip')"
                >
                  全部跳过
                </n-button>
                <n-button 
                  size="tiny" 
                  secondary 
                  :type="currentBatchMode.inventory === 'overwrite' ? 'warning' : 'default'"
                  @click="applyToAll('inventory', 'overwrite')"
                >
                  全部覆盖
                </n-button>
              </div>

              <n-scrollbar style="max-height: 400px">
                <div 
                  v-for="item in scanResult.conflicts.inventory" 
                  :key="item.remote.id" 
                  class="conflict-row"
                >
                  <div class="card remote">
                    <div class="badges-container">
                      <div v-if="item.hasFileDiff" class="mini-badge warning">
                        <n-icon :component="ImageOutline" /> 资源变动
                      </div>
                      <div class="mini-badge info">资源包</div>
                    </div>

                    <div class="info-line">
                      <n-icon :component="CubeOutline" /> 
                      <strong>{{ item.remote.name }}</strong>
                    </div>
                    <div class="detail-line">封装: {{ item.remote.package }} | 值: {{ item.remote.value }}</div>
                    <div class="detail-line stock" :class="{ diff: item.remote.quantity !== item.local.quantity }">
                      库存: {{ item.remote.quantity }}
                    </div>
                  </div>

                  <div class="decision-area">
                    <n-icon :component="ArrowForward" class="arrow-icon" />
                    
                    <div class="radio-group" v-if="item.remote.id">
                      <div 
                        class="radio-btn"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'keep_both' }"
                        @click="inventoryDecisions[item.remote.id] = 'keep_both'"
                      >
                        <n-icon :component="CopyOutline" />
                        <span>保留两者</span>
                        <div class="sub-tip">自动重命名</div>
                      </div>

                      <div 
                        class="radio-btn"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'skip' }"
                        @click="inventoryDecisions[item.remote.id] = 'skip'"
                      >
                        <n-icon :component="CloseCircleOutline" />
                        <span>跳过</span>
                        <div class="sub-tip">保留本机数据</div>
                      </div>

                      <div 
                        class="radio-btn danger"
                        :class="{ active: inventoryDecisions[item.remote.id] === 'overwrite' }"
                        @click="inventoryDecisions[item.remote.id] = 'overwrite'"
                      >
                        <n-icon :component="AlertCircleOutline" />
                        <span>覆盖</span>
                        <div class="sub-tip">更新本机信息</div>
                      </div>
                    </div>
                  </div>

                  <div class="card local">
                    <div class="mini-badge local-badge">本机</div>
                    <div class="info-line">
                      <n-icon :component="CubeOutline" /> 
                      <strong>{{ item.local.name }}</strong>
                    </div>
                    <div class="detail-line">封装: {{ item.local.package }} | 值: {{ item.local.value }}</div>
                    <div class="detail-line stock">库存: {{ item.local.quantity }}</div>
                  </div>
                </div>
              </n-scrollbar>
            </div>
          </n-tab-pane>

          <n-tab-pane name="projects" tab="项目冲突">
            <div class="conflict-list">
              <div v-if="scanResult.conflicts.projects.length === 0" class="empty-state">
                <p>无项目冲突</p>
              </div>

              <div class="batch-bar" v-else>
                 <span>批量操作：</span>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'keep_both' ? 'primary' : 'default'"
                   @click="applyToAll('projects', 'keep_both')"
                 >
                   全部保留副本
                 </n-button>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'skip' ? 'primary' : 'default'"
                   @click="applyToAll('projects', 'skip')"
                 >
                   全部跳过
                 </n-button>
                 <n-button 
                   size="tiny" 
                   secondary 
                   :type="currentBatchMode.projects === 'overwrite' ? 'warning' : 'default'"
                   @click="applyToAll('projects', 'overwrite')"
                 >
                   全部覆盖
                 </n-button>
              </div>

              <n-scrollbar style="max-height: 400px">
                <div 
                  v-for="proj in scanResult.conflicts.projects" 
                  :key="proj.remote.id" 
                  class="conflict-row"
                >
                  <div class="card remote">
                    <div class="badges-container">
                      <div v-if="proj.hasFileDiff" class="mini-badge warning">
                        <n-icon :component="ImageOutline" /> 文件变动
                      </div>
                      <div class="mini-badge info">资源包</div>
                    </div>

                    <div class="info-line">
                      <n-icon :component="LayersOutline" /> 
                      <strong>{{ proj.remote.name }}</strong>
                    </div>
                      <div class="detail-line date" :class="{ diff: proj.remote.created_at !== proj.local.created_at }">
                      <n-icon :component="TimeOutline" /> {{ formatDate(proj.remote.created_at) }}
                    </div>
                  </div>

                  <div class="decision-area">
                    <n-icon :component="ArrowForward" class="arrow-icon" />
                    <div class="radio-group" v-if="proj.remote.id">
                        
                      <div 
                        class="radio-btn"
                        :class="{ active: projectDecisions[proj.remote.id] === 'keep_both' }"
                        @click="projectDecisions[proj.remote.id] = 'keep_both'"
                      >
                        <n-icon :component="CopyOutline" />
                        <span>保留两者</span>
                        <div class="sub-tip">自动重命名</div>
                      </div>

                      <div 
                        class="radio-btn"
                        :class="{ active: projectDecisions[proj.remote.id] === 'skip' }"
                        @click="projectDecisions[proj.remote.id] = 'skip'"
                      >
                        <n-icon :component="CloseCircleOutline" />
                        <span>跳过</span>
                        <div class="sub-tip">保留本机数据</div>
                      </div>

                      <div 
                        class="radio-btn danger"
                        :class="{ active: projectDecisions[proj.remote.id] === 'overwrite' }"
                        @click="projectDecisions[proj.remote.id] = 'overwrite'"
                      >
                        <n-icon :component="AlertCircleOutline" />
                        <span>覆盖</span>
                        <div class="sub-tip">更新本机信息</div>
                      </div>

                    </div>
                  </div>

                  <div class="card local">
                    <div class="mini-badge local-badge">本机</div>
                    <div class="info-line">
                      <n-icon :component="LayersOutline" /> 
                      <strong>{{ proj.local.name }}</strong>
                    </div>
                    <div class="detail-line date">
                      <n-icon :component="TimeOutline" /> {{ formatDate(proj.local.created_at) }}
                    </div>
                  </div>
                </div>
              </n-scrollbar>
            </div>
          </n-tab-pane>

        </n-tabs>
      </div>

      <div class="modal-footer">
        <div class="footer-tip">
          <n-icon :component="AlertCircleOutline" /> 
          <span>⚠️ 注意：导入仅同步元器件基本信息（图片/手册）。库存数量将保留本地现状（覆盖时）或归零（新增时），不会应用资源包中的库存。</span>
        </div>
        <div class="footer-btns">
          <n-button @click="emit('update:show', false)" :disabled="isImporting">取消</n-button>
          <n-button type="primary" :loading="isImporting" @click="handleConfirm">
            执行导入
          </n-button>
        </div>
      </div>

    </n-card>
  </n-modal>
</template>

<style scoped>
.conflict-modal {
  width: 900px;
  background-color: #1c1c1e;
  border-radius: 16px;
  overflow: hidden;
}

:deep(.n-card__content) { padding: 0 !important; }

.modal-header {
  padding: 20px 24px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.header-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 8px; }
.header-summary { font-size: 14px; color: #aaa; }
.highlight { color: #FF9F0A; font-size: 16px; margin: 0 4px; }
.new-item-text { color: #30D158; }

.modal-content { padding: 0; min-height: 400px; }
:deep(.n-tabs-nav) { padding: 12px 24px 0 24px; }

.conflict-list { padding: 16px 24px; background: #1c1c1e; }
.batch-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: #888; font-size: 12px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 300px; color: #666; gap: 16px;
}

.conflict-row {
  display: flex; align-items: stretch; gap: 12px; margin-bottom: 16px;
  background: rgba(255,255,255,0.02); padding: 12px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.05);
}

.card {
  flex: 1; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px; position: relative;
  border: 1px solid transparent;
}
.card.local { border-color: rgba(255,255,255,0.05); }
.card.remote { border-color: rgba(10, 132, 255, 0.2); background: rgba(10, 132, 255, 0.05); }

/* Badge System */
.badges-container {
  position: absolute; top: 8px; right: 8px; display: flex; gap: 6px;
}

.mini-badge {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; 
  display: flex; align-items: center; gap: 4px;
}
.mini-badge.info { background: #0A84FF; color: white; }
.mini-badge.warning { background: #FF9F0A; color: black; font-weight: bold; }
.mini-badge.local-badge { position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1); color: #aaa; }

.info-line { display: flex; align-items: center; gap: 6px; color: #fff; font-size: 14px; margin-top: 4px; }
.detail-line { font-size: 12px; color: #888; }
.stock { font-family: monospace; font-size: 13px; }
.diff { color: #FF9F0A; font-weight: bold; }

.decision-area {
  width: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
}
.arrow-icon { color: #444; font-size: 20px; opacity: 0.5; }

.radio-group { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.radio-btn {
  background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px;
  cursor: pointer; display: flex; flex-direction: column; align-items: flex-start;
  border: 1px solid transparent; transition: all 0.2s; position: relative;
}
.radio-btn span { font-size: 13px; color: #ccc; font-weight: bold; display: flex; align-items: center; gap: 6px; }
.sub-tip { font-size: 10px; color: #666; margin-left: 20px; }

.radio-btn:hover { background: rgba(255,255,255,0.1); }
.radio-btn.active { background: rgba(48, 209, 88, 0.15); border-color: #30D158; }
.radio-btn.active span { color: #30D158; }

.radio-btn.danger.active { background: rgba(255, 69, 58, 0.15); border-color: #FF453A; }
.radio-btn.danger.active span { color: #FF453A; }

.modal-footer {
  padding: 16px 24px;
  background: rgba(0,0,0,0.2);
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex; justify-content: space-between; align-items: center;
}
.footer-tip { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; }
.footer-btns { display: flex; gap: 12px; }
</style>