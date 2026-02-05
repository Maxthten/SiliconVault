<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NCard, NInputNumber, NButton, NCollapse, NCollapseItem, NTable, useMessage, useDialog } from 'naive-ui'

const props = defineProps<{
  show: boolean
  project: any
}>()

const emit = defineEmits(['update:show', 'success'])
const message = useMessage()
const dialog = useDialog() // 引入 Dialog 用于二次确认

const multiplier = ref(1)
const deductionList = ref<any[]>([])

// 监听打开
watch(() => props.show, async (val) => {
  if (val && props.project) {
    multiplier.value = 1
    const items = await window.api.getProjectDetail(props.project.id)
    deductionList.value = items.map(i => ({
      ...i,
      base_qty: i.quantity,
      deduct_qty: i.quantity
    }))
  }
})

// 自动计算扣减量
const updateDeductions = () => {
  deductionList.value.forEach(item => {
    item.deduct_qty = item.base_qty * multiplier.value
  })
}

// 🟢 核心：带检查的执行逻辑
const preCheckAndExecute = () => {
  // 1. 找出库存不足的项
  const lackItems = deductionList.value.filter(item => item.current_stock < item.deduct_qty)
  
  if (lackItems.length > 0) {
    // 2. 如果有缺货，弹出警告
    const names = lackItems.map(i => `${i.name}`).join('、')
    const totalCount = lackItems.length
    
    dialog.warning({
      title: '⚠️ 库存不足警告',
      content: `以下 ${totalCount} 种元件库存不足：\n[ ${names} ]\n\n强行扣减将导致库存变为负数，请生产后尽快补货！`,
      positiveText: '明白，继续执行',
      negativeText: '取消',
      onPositiveClick: () => {
        doExecute() // 用户确认后，继续
      }
    })
  } else {
    // 3. 库存充足，直接二次确认
    dialog.success({
      title: '确认生产',
      content: `确定要扣减 ${multiplier.value} 套 BOM 库存吗？`,
      positiveText: '确定扣减',
      negativeText: '取消',
      onPositiveClick: () => {
        doExecute()
      }
    })
  }
}

// 执行数据库操作
const doExecute = async () => {
  try {
    const payload = deductionList.value.map(i => ({
      id: i.inventory_id,
      deductQty: i.deduct_qty
    }))
    
    await window.api.executeDeduction(payload)
    message.success(`成功扣减 ${payload.length} 种元件库存`)
    emit('update:show', false)
    emit('success')
  } catch (e) {
    message.error('扣减失败: ' + e)
  }
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card 
      title="🏭 生产执行 (库存扣减)" 
      class="run-modal" 
      :bordered="false" 
      size="huge"
      role="dialog" 
      aria-modal="true"
    >
      <div class="control-panel">
        <div class="label">本次生产数量 (PCS):</div>
        <n-input-number 
          v-model:value="multiplier" 
          :min="1" 
          size="large" 
          class="multiplier-input"
          @update:value="updateDeductions"
        >
          <template #suffix>套</template>
        </n-input-number>
      </div>

      <div class="detail-panel">
        <n-collapse arrow-placement="right">
          <n-collapse-item :title="`📦 扣减清单预览 (共需 ${deductionList.length} 种元件)`" name="1">
            <div class="table-container">
              <n-table size="small" :single-line="false" class="dark-table">
                <thead>
                  <tr>
                    <th>元件</th>
                    <th>当前库存</th>
                    <th>本次扣减</th>
                    <th>预计剩余</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in deductionList" :key="item.inventory_id">
                    <td>{{ item.name }} <span class="sub-val">{{ item.value }}</span></td>
                    
                    <td :class="{ 'neg-stock': item.current_stock < 0 }">
                      {{ item.current_stock }}
                    </td>
                    
                    <td>
                      <n-input-number 
                        v-model:value="item.deduct_qty" 
                        size="tiny" 
                        :min="0"
                        :show-button="false"
                        class="manual-input" 
                      />
                    </td>

                    <td :class="{ 'warning-text': (item.current_stock - item.deduct_qty) < 0 }">
                      {{ item.current_stock - item.deduct_qty }}
                    </td>
                  </tr>
                </tbody>
              </n-table>
            </div>
          </n-collapse-item>
        </n-collapse>
      </div>

      <template #footer>
        <div class="footer">
          <n-button @click="emit('update:show', false)">取消</n-button>
          
          <n-button type="success" size="large" @click="preCheckAndExecute">
            🚀 确认并扣减库存
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.run-modal { width: 650px; background-color: #1c1c1e; border-radius: 16px; }

.control-panel {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 30px 0; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 20px;
}
.label { font-size: 18px; font-weight: bold; color: #fff; }
.multiplier-input { width: 150px; text-align: center; }

.detail-panel { margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0 12px; }
.table-container { max-height: 300px; overflow-y: auto; margin-bottom: 10px; }

.sub-val { color: #888; font-size: 12px; margin-left: 4px; }
.manual-input { width: 80px; }

/* 样式警告 */
.neg-stock { color: #FF453A; font-weight: bold; }
.warning-text { color: #FF453A; font-weight: 800; }

.dark-table { background: transparent; }
:deep(.n-table th), :deep(.n-table td) { background: transparent; color: #ddd; border-bottom: 1px solid rgba(255,255,255,0.1); }

.footer { display: flex; justify-content: flex-end; gap: 12px; }
</style>