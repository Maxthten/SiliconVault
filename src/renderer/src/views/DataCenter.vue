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
import { ref } from 'vue'
import Papa from 'papaparse'
import { 
  NIcon, useMessage, NSpin, NButton
} from 'naive-ui'
import { 
  CloudDownloadOutline, CloudUploadOutline, 
  ArrowForward, TimeOutline, DocumentTextOutline, ArchiveOutline
} from '@vicons/ionicons5'

// 组件引入
import ExportWizardModal from '../components/ExportWizardModal.vue'
import ImportConflictModal from '../components/ImportConflictModal.vue'
import CsvImportModal from '../components/CsvImportModal.vue'

import type { ScanResult } from '../../../preload/index'

const message = useMessage()

// 状态管理
const isProcessing = ref(false)
const processingText = ref('')

// 导出相关
const showExportWizard = ref(false)
const exportWizardMode = ref<'inventory' | 'project'>('inventory')

// 导入相关 (资源包)
const showConflictModal = ref(false)
const currentScanResult = ref<ScanResult | null>(null)

// 导入相关 (CSV)
const showCsvModal = ref(false)
const currentCsvFile = ref<File | null>(null)

// 辅助功能：导出日志
const handleExportLogs = async (e: Event) => {
  e.stopPropagation() 
  try {
    const logs = await window.api.getLogs()
    if (!logs || logs.length === 0) return message.warning('暂无日志')
    
    const csv = Papa.unparse(logs)
    const success = await window.api.exportData({
      title: '导出操作日志',
      filename: `SystemLogs_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv
    })
    if (success) message.success('日志导出成功')
    return
  } catch (e) {
    message.error('导出失败')
    return
  }
}

// 辅助功能：下载 CSV 导入模板
const handleDownloadCsvTemplate = async (e: Event) => {
  e.stopPropagation()
  try {
    const templateData = [
      { 
        category: '电阻', 
        name: '贴片电阻', 
        value: '10k 1%', 
        package: '0805', 
        quantity: 1000, 
        location: 'A-01-01', 
        min_stock: 100 
      },
      { 
        category: 'MCU', 
        name: 'STM32F103C8T6', 
        value: 'ARM Cortex-M3', 
        package: 'LQFP-48', 
        quantity: 50, 
        location: 'IC-Box-05', 
        min_stock: 10 
      }
    ]
    
    const csv = Papa.unparse(templateData)
    const success = await window.api.exportData({
      title: '保存 CSV 导入模板',
      filename: 'Inventory_Import_Template.csv',
      content: csv
    })
    
    if (success) message.success('模板已保存')
  } catch (e) {
    message.error('模板生成失败')
  }
}

// 辅助功能：下载 SVData 完整包模板
const handleDownloadSvDataTemplate = async (e: Event) => {
  e.stopPropagation()
  try {
    const folderPath = await window.api.selectFolder()
    if (!folderPath) return

    const separator = folderPath.includes('\\') ? '\\' : '/'
    const fullPath = `${folderPath}${separator}SiliconVault_Template.svdata`

    isProcessing.value = true
    processingText.value = '正在生成标准模板包...'

    const res = await window.api.generateTemplate(fullPath)
    
    if (res.success) {
      message.success('标准资源包模板已生成')
    }
  } catch (e) {
    console.error(e)
    message.error('模板生成失败')
  } finally {
    isProcessing.value = false
  }
}

const openExportWizard = () => {
  exportWizardMode.value = 'inventory'
  showExportWizard.value = true
}

const fileInputRef = ref<HTMLInputElement | null>(null)

const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  const file = input.files[0]
  const path = window.api.getFilePath(file) 
  const fileName = file.name.toLowerCase()

  input.value = '' 

  if (!path) {
    message.error('无法读取文件路径')
    return
  }

  if (fileName.endsWith('.csv')) {
    currentCsvFile.value = file
    showCsvModal.value = true
  } else if (fileName.endsWith('.svdata') || fileName.endsWith('.zip')) {
    handleBundleImport(path)
  } else {
    message.error('不支持的文件格式')
  }
}

const handleBundleImport = async (path: string) => {
  isProcessing.value = true
  processingText.value = '正在解析资源包...'
  
  try {
    const result = await window.api.scanBundle(path)
    currentScanResult.value = result
    showConflictModal.value = true
  } catch (e) {
    console.error(e)
    message.error('资源包解析失败')
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <div class="data-center-page">
    <h2 class="page-title">数据中心</h2>

    <div class="main-actions">
      
      <div class="action-card export-card" @click="openExportWizard">
        <div class="card-inner">
          <div class="icon-box">
            <n-icon :component="CloudDownloadOutline" />
          </div>
          <div class="text-content">
            <div class="title">导出数据</div>
            <div class="desc">备份库存、项目工程或生成 Excel/CSV 报表</div>
          </div>
          <div class="arrow">
            <n-icon :component="ArrowForward" />
          </div>
        </div>

        <div class="card-footer">
          <n-button text size="small" class="sub-btn" @click="handleExportLogs">
            <template #icon><n-icon :component="TimeOutline" /></template>
            导出系统日志
          </n-button>
        </div>
      </div>

      <div 
        class="action-card import-card" 
        @click="triggerFileSelect"
        @dragover.prevent
        @drop.prevent="(e) => { 
          if (e.dataTransfer?.files.length) {
            const fakeInput = { files: e.dataTransfer.files, value: '' } as any
            handleFileChange({ target: fakeInput } as any)
          }
        }"
      >
        <input 
          type="file" 
          ref="fileInputRef" 
          accept=".csv,.svdata,.zip" 
          style="display: none" 
          @change="handleFileChange"
        >
        
        <div v-if="isProcessing" class="loading-overlay">
          <n-spin size="large" />
          <p>{{ processingText }}</p>
        </div>

        <div v-else class="card-inner">
          <div class="icon-box">
            <n-icon :component="CloudUploadOutline" />
          </div>
          <div class="text-content">
            <div class="title">导入数据</div>
            <div class="desc">点击或拖入 .csv 表格 / .svdata 资源包</div>
          </div>
        </div>

        <div class="card-footer">
          <div class="template-btns">
            <n-button text size="small" class="sub-btn" @click="handleDownloadCsvTemplate">
              <template #icon><n-icon :component="DocumentTextOutline" /></template>
              CSV 模板
            </n-button>
            <div class="divider"></div>
            <n-button text size="small" class="sub-btn" @click="handleDownloadSvDataTemplate">
              <template #icon><n-icon :component="ArchiveOutline" /></template>
              SVData 模板
            </n-button>
          </div>
        </div>
      </div>

    </div>

    <ExportWizardModal v-model:show="showExportWizard" :mode="exportWizardMode" />

    <ImportConflictModal 
      v-model:show="showConflictModal" 
      :scan-result="currentScanResult" 
      @confirm="message.success('导入完成')"
    />

    <CsvImportModal 
      v-model:show="showCsvModal" 
      :file="currentCsvFile"
      @success="message.success('CSV 导入成功')"
    />

  </div>
</template>

<style scoped>
.data-center-page {
  padding: 40px; height: 100vh; display: flex; flex-direction: column;
  background: transparent; 
  color: var(--text-primary); 
  box-sizing: border-box;
}
.page-title { font-size: 28px; font-weight: 800; margin-bottom: 40px; letter-spacing: -0.5px; }

.main-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 30px; flex: 1;
  max-height: 400px;
}

.action-card {
 
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  
  border-radius: 24px;
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.action-card:hover {
  background: var(--bg-card); /* 保持背景，利用边框和位移做交互 */
  border-color: var(--border-hover);
  transform: translateY(-5px);
  /* 亮色模式下增加阴影深度 */
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15); 
}

.card-inner {
  flex: 1; display: flex; align-items: center; padding: 40px;
}

.icon-box {
  width: 80px; height: 80px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center;
  font-size: 40px; margin-right: 24px; flex-shrink: 0;
}

.export-card .icon-box { background: rgba(10, 132, 255, 0.15); color: #0A84FF; }
.import-card .icon-box { background: rgba(48, 209, 88, 0.15); color: #30D158; }

.text-content { flex: 1; }
.title { font-size: 22px; font-weight: bold; margin-bottom: 8px; color: var(--text-primary); }
.desc { font-size: 14px; color: var(--text-tertiary); line-height: 1.5; }

.arrow {
  font-size: 24px; color: var(--text-tertiary); opacity: 0; transform: translateX(-20px); transition: all 0.3s;
}
.action-card:hover .arrow { opacity: 1; transform: translateX(0); color: var(--text-primary); }

.card-footer {
  padding: 16px 40px;
  border-top: 1px solid var(--border-main);
  display: flex; justify-content: flex-end;
}
.template-btns { display: flex; align-items: center; gap: 12px; }
.divider { width: 1px; height: 12px; background: var(--border-main); }

.sub-btn { color: var(--text-tertiary); transition: color 0.2s; }
.sub-btn:hover { color: var(--text-primary); }

.import-card { border-style: dashed; border-width: 2px; }
.import-card:hover { border-color: #30D158; background: rgba(48, 209, 88, 0.05); }

.loading-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;

  background: var(--bg-modal); 
  z-index: 10;
}

@media (max-width: 800px) {
  .main-actions { grid-template-columns: 1fr; max-height: none; }
}
</style>