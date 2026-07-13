/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SiliconVaultAPI } from '../shared/types'
export type * from '../shared/types'

// 自定义 API
const api: SiliconVaultAPI = {
  // --- 0. 窗口控制 ---
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window-control', action),

  // --- 1. 库存管理 ---
  fetchCategories: () => ipcRenderer.invoke('get-categories'),
  fetchPackages: (category) => ipcRenderer.invoke('get-packages', category),
  fetchInventory: (filters) => ipcRenderer.invoke('get-inventory', filters),
  getInventoryHealth: () => ipcRenderer.invoke('get-inventory-health'),
  updateQty: (id, qty) => ipcRenderer.invoke('update-qty', { id, qty }),
  batchUpdateQty: (updates) => ipcRenderer.invoke('batch-update-qty', updates),
  onInventoryChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('inventory-changed', listener)
    return () => ipcRenderer.removeListener('inventory-changed', listener)
  },
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  upsertItem: (data) => ipcRenderer.invoke('upsert-item', data),

  // --- 2. BOM 项目 ---
  getProjects: (query, ids) => ipcRenderer.invoke('get-projects', { query, ids }),
  getRelatedProjects: (id) => ipcRenderer.invoke('get-related-projects', id),
  getProjectDetail: (id) => ipcRenderer.invoke('get-project-detail', id),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  executeDeduction: (items, context) => ipcRenderer.invoke('execute-deduction', { items, context }),

  // --- 3. 排序与规则 ---
  updateSortOrder: (table, ids) => ipcRenderer.invoke('update-sort-order', { table, ids }),
  getCategoryRule: (cat) => ipcRenderer.invoke('get-category-rule', cat),
  getAllCategoryRules: () => ipcRenderer.invoke('get-all-category-rules'),
  saveCategoryRule: (cat, rule) => ipcRenderer.invoke('save-category-rule', { cat, rule }),
  resetCategoryRule: (cat) => ipcRenderer.invoke('reset-category-rule', cat),

  // --- 4. 时光机 ---
  getLogs: () => ipcRenderer.invoke('get-logs'),
  undoOperation: (logId) => ipcRenderer.invoke('undo-operation', logId),

  // --- 5. 消耗看板 ---
  getConsumptionStats: (range, useMock) => ipcRenderer.invoke('get-consumption-stats', { range, useMock }),

  // --- 6. 数据中心 ---
  exportData: (payload) => ipcRenderer.invoke('export-data', payload),
  // 支持传递 options (如 title, filterName)
  readFileText: (options) => ipcRenderer.invoke('read-file-text', options),
  getAllInventoryExport: () => ipcRenderer.invoke('get-all-inventory-export'),
  getAllProjectsExport: () => ipcRenderer.invoke('get-all-projects-export'), 
  batchImportInventory: (items, mode) => ipcRenderer.invoke('batch-import-inventory', { items, mode }),
  
  exportBundle: (options) => ipcRenderer.invoke('export-bundle', options),
  scanBundle: (filePath) => ipcRenderer.invoke('scan-bundle', filePath),
  executeImportBundle: (scanId, strategies) => ipcRenderer.invoke('execute-import-bundle', { scanId, strategies }),
  generateTemplate: (filePath) => ipcRenderer.invoke('generate-template', filePath),
  
  getFilePath: (file) => webUtils.getPathForFile(file),

  // --- 7. 系统设置与资源管理 ---
  getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
  getRuntimeEnvironment: () => ipcRenderer.invoke('get-runtime-environment'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  openFile: (relativePath) => ipcRenderer.invoke('open-file', relativePath),
  showItemInFolder: (relativePath) => ipcRenderer.invoke('show-item-in-folder', relativePath),
  saveAsset: (sourcePath, group, category) => 
    ipcRenderer.invoke('save-asset', { sourcePath, group, category }),
  saveBuffer: (buffer, filename, group, category) => 
    ipcRenderer.invoke('save-buffer', { buffer, filename, group, category }),
  // 支持传递 options (如 title, buttonLabel)
  selectFolder: (options) => ipcRenderer.invoke('select-folder', options),
  updateStoragePath: (newPath) => ipcRenderer.invoke('update-storage-path', newPath),
  scanUnusedAssets: () => ipcRenderer.invoke('scan-unused-assets'),
  purgeUnusedAssets: (files) => ipcRenderer.invoke('purge-unused-assets', files),
  getMaintenanceDiagnostics: () => ipcRenderer.invoke('get-maintenance-diagnostics'),
  optimizeDatabase: () => ipcRenderer.invoke('optimize-database'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // --- 8. 自动备份设置 ---
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const globalWindow = window as typeof window & {
    electron: typeof electronAPI
    api: SiliconVaultAPI
  }
  globalWindow.electron = electronAPI
  globalWindow.api = api
}
