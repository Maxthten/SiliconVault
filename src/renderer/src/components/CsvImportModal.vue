<script setup lang="ts">
import { ref, watch } from 'vue'
import Papa from 'papaparse'
import { 
  NModal,  NButton, NIcon, NAlert, NDataTable, 
  NRadioGroup, NRadioButton, useMessage, NSpin 
} from 'naive-ui'
import { DocumentTextOutline } from '@vicons/ionicons5'

const props = defineProps<{
  show: boolean
  file: File | null
}>()

const emit = defineEmits(['update:show', 'success'])
const message = useMessage()

// === 状态 ===
const isParsing = ref(false)
const isImporting = ref(false)
const csvData = ref<any[]>([])
const csvHeaders = ref<string[]>([])
const importMode = ref<'skip' | 'merge' | 'overwrite'>('skip')

// === 监听文件变化自动解析 ===
watch(() => props.file, (newFile) => {
  if (newFile && props.show) {
    parseCsv(newFile)
  }
})

// === 解析逻辑 ===
const parseCsv = (file: File) => {
  isParsing.value = true
  csvData.value = []
  csvHeaders.value = []

  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV Parse Warnings:', results.errors)
          message.warning('CSV 解析存在部分格式警告，请仔细核对预览')
        }
        
        csvData.value = results.data as any[]
        csvHeaders.value = results.meta.fields || []
        isParsing.value = false
      },
      error: (err) => {
        console.error(err)
        message.error('CSV 读取失败')
        isParsing.value = false
      }
    })
  }
  reader.readAsText(file)
}

// === 导入执行 ===
const handleConfirm = async () => {
  if (csvData.value.length === 0) return
  
  isImporting.value = true
  try {
    // 字段映射与清洗
    const items = csvData.value.map((row: any) => ({
      category: row['Category'] || row['category'] || row['分类'] || '未分类',
      name: row['Name'] || row['name'] || row['名称'] || row['型号'] || '未知',
      value: row['Value'] || row['value'] || row['值'] || row['规格'] || '',
      package: row['Package'] || row['package'] || row['封装'] || '',
      quantity: Number(row['Quantity'] || row['quantity'] || row['数量']) || 0,
      location: row['Location'] || row['location'] || row['库位'] || row['位置'] || '',
      min_stock: Number(row['MinStock'] || row['min_stock'] || row['预警阈值']) || 10
    }))

    const res = await window.api.batchImportInventory(items, importMode.value)
    
    // @ts-ignore
    message.success(`导入完成：成功 ${res.success} 条，跳过/失败 ${res.skipped} 条`)
    emit('success')
    emit('update:show', false)
  } catch (e) {
    console.error(e)
    message.error('写入数据库失败')
  } finally {
    isImporting.value = false
  }
}

const handleClose = () => {
  if (!isImporting.value) {
    emit('update:show', false)
  }
}
</script>

<template>
  <n-modal 
    :show="show" 
    @update:show="(v) => emit('update:show', v)"
    preset="card"
    title="CSV 导入向导"
    style="width: 800px"
    :mask-closable="!isImporting"
    :close-on-esc="!isImporting"
  >
    <div class="csv-modal-content">
      
      <div class="strategy-bar">
        <div class="label">重复数据策略：</div>
        <n-radio-group v-model:value="importMode" name="csv_strategy" :disabled="isImporting">
          <n-radio-button value="skip">跳过 (保留旧数据)</n-radio-button>
          <n-radio-button value="merge">累加库存数量</n-radio-button>
          <n-radio-button value="overwrite">完全覆盖信息</n-radio-button>
        </n-radio-group>
      </div>

      <div class="preview-area">
        <div v-if="isParsing" class="loading-state">
          <n-spin size="large" />
          <p>正在解析表格...</p>
        </div>

        <div v-else-if="csvData.length > 0">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
            共解析到 <strong>{{ csvData.length }}</strong> 条数据。请检查下方列名是否正确识别。
          </n-alert>
          
          <n-data-table
            size="small"
            :columns="csvHeaders.slice(0, 6).map(h => ({ title: h, key: h }))"
            :data="csvData.slice(0, 5)"
            :bordered="false"
            style="opacity: 0.9"
          />
          
          <div v-if="csvData.length > 5" class="more-hint">
            ... 还有 {{ csvData.length - 5 }} 条数据未显示
          </div>
        </div>

        <div v-else class="empty-state">
          <n-icon size="48" :depth="4" :component="DocumentTextOutline" />
          <p>暂无数据或解析失败</p>
        </div>
      </div>

    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleClose" :disabled="isImporting">取消</n-button>
        <n-button 
          type="primary" 
          :loading="isImporting" 
          :disabled="csvData.length === 0 || isParsing"
          @click="handleConfirm"
        >
          确认导入数据库
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.csv-modal-content {
  display: flex; flex-direction: column; gap: 20px;
}

.strategy-bar {
  display: flex; align-items: center; gap: 16px;
  padding: 16px; background: rgba(255, 255, 255, 0.05);
  border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);
}
.label { font-weight: bold; color: #ddd; }

.preview-area {
  min-height: 200px;
}

.loading-state, .empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 200px; color: #666; gap: 12px;
}

.more-hint {
  text-align: center; padding: 12px; color: #666; font-size: 12px;
  border-top: 1px dashed rgba(255,255,255,0.1);
}

.modal-footer {
  display: flex; justify-content: flex-end; gap: 12px;
}
</style>