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
import { ref, watch } from 'vue'
import Papa from 'papaparse'
import { 
  NModal, NCard, NButton, NIcon, NAlert, NDataTable, 
  NRadioGroup, NRadioButton, useMessage, NSpin 
} from 'naive-ui'
import { DocumentTextOutline } from '@vicons/ionicons5'
import { useI18n } from '../utils/i18n' // 引入国际化

// 定义合法的导入策略类型，需与 index.d.ts 保持一致
type ImportStrategy = 'skip' | 'overwrite' | 'keep_both'

const props = defineProps<{
  show: boolean
  file: File | null
}>()

const emit = defineEmits(['update:show', 'success'])
const message = useMessage()
const { t } = useI18n()

// === 状态 ===
const isParsing = ref(false)
const isImporting = ref(false)
const csvData = ref<any[]>([])
const csvHeaders = ref<string[]>([])
const importMode = ref<ImportStrategy>('skip')

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
          message.warning(t('csvImport.messages.parseWarning'))
        }
        
        csvData.value = results.data as any[]
        csvHeaders.value = results.meta.fields || []
        isParsing.value = false
      },
      error: (err) => {
        console.error(err)
        message.error(t('csvImport.messages.readFailed'))
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
    
    message.success(t('csvImport.messages.success', { success: res.success, skipped: res.skipped }))
    emit('success')
    emit('update:show', false)
  } catch (e) {
    console.error(e)
    message.error(t('csvImport.messages.importFailed'))
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
    :mask-closable="!isImporting"
    :close-on-esc="!isImporting"
  >
    <n-card 
      class="csv-modal" 
      :title="t('csvImport.title')" 
      :bordered="false" 
      role="dialog" 
      aria-modal="true"
    >
      <div class="csv-modal-content">
        
        <div class="strategy-bar">
          <div class="label">{{ t('csvImport.strategyLabel') }}</div>
          <n-radio-group v-model:value="importMode" name="csv_strategy" :disabled="isImporting">
            <n-radio-button value="skip">{{ t('csvImport.strategies.skip') }}</n-radio-button>
            <n-radio-button value="keep_both">{{ t('csvImport.strategies.keepBoth') }}</n-radio-button>
            <n-radio-button value="overwrite">{{ t('csvImport.strategies.overwrite') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div class="preview-area">
          <div v-if="isParsing" class="loading-state">
            <n-spin size="large" />
            <p>{{ t('csvImport.status.parsing') }}</p>
          </div>

          <div v-else-if="csvData.length > 0">
            <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
              <span v-html="t('csvImport.messages.parseSuccess', { count: csvData.length })"></span>
            </n-alert>
            
            <n-data-table
              size="small"
              :columns="csvHeaders.slice(0, 6).map(h => ({ title: h, key: h }))"
              :data="csvData.slice(0, 5)"
              :bordered="false"
              class="preview-table"
            />
            
            <div v-if="csvData.length > 5" class="more-hint">
              {{ t('csvImport.messages.moreItems', { count: csvData.length - 5 }) }}
            </div>
          </div>

          <div v-else class="empty-state">
            <n-icon size="48" :depth="4" :component="DocumentTextOutline" />
            <p>{{ t('csvImport.status.empty') }}</p>
          </div>
        </div>

      </div>

      <template #footer>
        <div class="modal-footer">
          <n-button @click="handleClose" :disabled="isImporting">{{ t('common.cancel') }}</n-button>
          <n-button 
            type="primary" 
            :loading="isImporting" 
            :disabled="csvData.length === 0 || isParsing"
            @click="handleConfirm"
          >
            {{ t('csvImport.actions.import') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
/* 样式保持不变 */
.csv-modal {
  width: 800px;
  background-color: var(--bg-modal);
  border-radius: 16px;
}

:deep(.n-card-header__main) {
  color: var(--text-primary);
}

.csv-modal-content {
  display: flex; flex-direction: column; gap: 20px;
}

.strategy-bar {
  display: flex; align-items: center; gap: 16px;
  padding: 16px; 
  background: var(--bg-sidebar); 
  border-radius: 8px; 
  border: 1px solid var(--border-main);
}
.label { font-weight: bold; color: var(--text-primary); }

.preview-area {
  min-height: 200px;
}

.loading-state, .empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 200px; color: var(--text-tertiary); gap: 12px;
}

.more-hint {
  text-align: center; padding: 12px; color: var(--text-tertiary); font-size: 12px;
  border-top: 1px dashed var(--border-main);
}

.modal-footer {
  display: flex; justify-content: flex-end; gap: 12px;
}

:deep(.n-data-table) {
  background: transparent;
}
:deep(.n-data-table th) {
  background: var(--bg-sidebar) !important;
  color: var(--text-secondary) !important;
  border-bottom: 1px solid var(--border-main) !important;
}
:deep(.n-data-table td) {
  background: transparent !important;
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-main) !important;
}
</style>