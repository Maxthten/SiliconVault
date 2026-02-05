import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 API
const api = {
  // --- 1. 库存管理 ---
  fetchCategories: () => ipcRenderer.invoke('get-categories'),
  fetchPackages: (category) => ipcRenderer.invoke('get-packages', category),
  fetchInventory: (filters) => ipcRenderer.invoke('get-inventory', filters),
  updateQty: (id, qty) => ipcRenderer.invoke('update-qty', { id, qty }),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  upsertItem: (data) => ipcRenderer.invoke('upsert-item', data),

  // --- 2. BOM 项目 ---
  getProjects: (query) => ipcRenderer.invoke('get-projects', query),
  getProjectDetail: (id) => ipcRenderer.invoke('get-project-detail', id),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  executeDeduction: (items) => ipcRenderer.invoke('execute-deduction', items),

  // --- 3. 排序与规则 ---
  updateSortOrder: (table, ids) => ipcRenderer.invoke('update-sort-order', { table, ids }),
  getCategoryRule: (cat) => ipcRenderer.invoke('get-category-rule', cat),
  saveCategoryRule: (cat, rule) => ipcRenderer.invoke('save-category-rule', { cat, rule }),
  resetCategoryRule: (cat) => ipcRenderer.invoke('reset-category-rule', cat),

  // --- 4. 时光机 ---
  getLogs: () => ipcRenderer.invoke('get-logs'),
  undoOperation: (logId) => ipcRenderer.invoke('undo-operation', logId),

  // --- 5. 数据中心 (导入/导出) ---
  exportData: (payload) => ipcRenderer.invoke('export-data', payload),
  readFileText: () => ipcRenderer.invoke('read-file-text'),
  getAllInventoryExport: () => ipcRenderer.invoke('get-all-inventory-export'),
  getAllProjectsExport: () => ipcRenderer.invoke('get-all-projects-export'), 
  batchImportInventory: (items, mode) => ipcRenderer.invoke('batch-import-inventory', { items, mode }),
  
  // 导出全量资源包 (.svdata)
  exportBundle: (options) => ipcRenderer.invoke('export-bundle', options),

  // 预扫描资源包
  scanBundle: (filePath) => ipcRenderer.invoke('scan-bundle', filePath),
  
  // 执行资源包导入
  executeImportBundle: (scanId, strategies) => ipcRenderer.invoke('execute-import-bundle', { scanId, strategies }),

  // 生成 SVData 导入模板
  generateTemplate: (filePath) => ipcRenderer.invoke('generate-template', filePath),
  // 获取文件真实路径
  getFilePath: (file) => webUtils.getPathForFile(file),

  // --- 6. 系统设置与资源管理 ---
  getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  
  // 打开图片/PDF (调用系统默认程序)
  openFile: (relativePath) => ipcRenderer.invoke('open-file', relativePath),

  // 在资源管理器中显示并选中文件
  showItemInFolder: (relativePath) => ipcRenderer.invoke('show-item-in-folder', relativePath),
  
  // 保存文件到 assets 目录
  saveAsset: (sourcePath, group, category) => 
    ipcRenderer.invoke('save-asset', { sourcePath, group, category }),
  
  // 保存二进制流
  saveBuffer: (buffer, filename, group, category) => 
    ipcRenderer.invoke('save-buffer', { buffer, filename, group, category }),

  // 选择文件夹弹窗
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // 执行数据迁移
  updateStoragePath: (newPath) => ipcRenderer.invoke('update-storage-path', newPath),

  // 垃圾文件扫描与清理
  scanUnusedAssets: () => ipcRenderer.invoke('scan-unused-assets'),
  purgeUnusedAssets: (files) => ipcRenderer.invoke('purge-unused-assets', files),

  // 数据库优化
  optimizeDatabase: () => ipcRenderer.invoke('optimize-database'),

  getAppVersion: () => ipcRenderer.invoke('get-app-version')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
export interface ScanResult {
  scanId: string
  meta: any // 或者你定义的具体类型
  conflicts: {
    inventory: any[]
    projects: any[]
  }
  newItems: {
    inventory: number
    projects: number
  }
}

export type ImportStrategy = 'skip' | 'overwrite' | 'keep_both'