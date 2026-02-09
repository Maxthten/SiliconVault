/*
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
 */
import { ElectronAPI } from '@electron-toolkit/preload'

export interface InventoryItem {
  id?: number
  category: string
  name: string
  value: string
  package: string
  quantity: number
  location: string
  min_stock?: number
  image_paths?: string
  datasheet_paths?: string
  ref_count?: number // 新增：引用计数
}

export interface BomItem {
  inventory_id: number
  quantity: number
  name?: string
  value?: string
  package?: string
  category?: string
  current_stock?: number
}

export interface BomProject {
  id?: number
  name: string
  description: string
  created_at?: string
  items?: BomItem[]
  order_index?: number
  files?: string
}

export interface OperationLog {
  id: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT'
  target_id: number
  desc: string
  old_data?: string
  new_data?: string
  created_at: string
}

export interface FilterOptions {
  keyword?: string
  category?: string
  package?: string
}

export interface CategoryRule {
  nameLabel: string
  namePlaceholder: string
  valueLabel: string
  valuePlaceholder: string
  packageLabel: string
}

export interface AppSettings {
  autoBackup: boolean
  backupFrequency: 'exit' | '30min' | '1h' | '4h'
  backupPath: string
  maxBackups: number
}

export interface ScanResult {
  scanId: string
  meta: {
    version: string
    createdAt: number
    inventory: InventoryItem[]
    projects: BomProject[]
    projectItems: any[]
  }
  conflicts: {
    inventory: Array<{ local: InventoryItem, remote: InventoryItem, hasFileDiff?: boolean }>
    projects: Array<{ local: BomProject, remote: BomProject, hasFileDiff?: boolean }>
  }
  newItems: {
    inventory: number
    projects: number
  }
}

export interface UnusedAsset {
  name: string
  relativePath: string
  size: number
  mtime: number
}

export interface AssetScanResult {
  totalSize: number
  count: number
  items: UnusedAsset[]
}

export interface PurgeResult {
  successCount: number
  failCount: number
  freedSpace: number
}

export interface ConsumptionData {
  summary: {
    totalQuantity: number
    topCategory: string
    activeProject: string
    intensity: 'low' | 'medium' | 'high'
  }
  timeline: { date: string; value: number }[]
  categories: { name: string; value: number }[]
  heatmap: { date: string; count: number }[]
  ranking: { name: string; category: string; value: number }[]
}

export type ImportStrategy = 'skip' | 'overwrite' | 'keep_both'

export interface ImportStrategies {
  inventory: Record<number, ImportStrategy>
  projects: Record<number, ImportStrategy>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // --- 库存管理 ---
      fetchCategories: () => Promise<string[]>
      fetchPackages: (category?: string) => Promise<string[]>
      fetchInventory: (filters: FilterOptions) => Promise<Record<string, InventoryItem[]>>
      updateQty: (id: number, qty: number) => Promise<void>
      deleteItem: (id: number) => Promise<void>
      upsertItem: (data: InventoryItem) => Promise<void>

      // --- BOM 项目管理 ---
      // 修改：支持 query 字符串或 IDs 数组
      getProjects: (query?: string, ids?: number[]) => Promise<BomProject[]>
      // 新增：获取关联项目
      getRelatedProjects: (id: number) => Promise<Array<{ id: number, name: string }>>
      
      getProjectDetail: (id: number) => Promise<BomItem[]>
      saveProject: (project: BomProject) => Promise<void>
      deleteProject: (id: number) => Promise<void>
      executeDeduction: (items: { id: number, deductQty: number }[]) => Promise<void>

      // --- 字段规则配置 ---
      getCategoryRule: (cat: string) => Promise<CategoryRule>
      saveCategoryRule: (cat: string, rule: CategoryRule) => Promise<void>
      resetCategoryRule: (cat: string) => Promise<void>

      // --- 通用工具 ---
      updateSortOrder: (table: 'projects' | 'inventory', ids: number[]) => Promise<void>
      
      // --- 日志与撤销 ---
      getLogs: () => Promise<OperationLog[]>
      undoOperation: (logId: number) => Promise<void>

      // --- 消耗看板统计 ---
      getConsumptionStats: (range: 'day' | 'week' | 'month', useMock: boolean) => Promise<ConsumptionData>

      // --- 数据导入导出 (CSV) ---
      exportData: (payload: { title: string, filename: string, content: string }) => Promise<boolean>
      readFileText: () => Promise<string | null>
      getAllInventoryExport: () => Promise<any[]>
      getAllProjectsExport: () => Promise<any[]>
      batchImportInventory: (items: any[], mode: string) => Promise<{ success: number, skipped: number }>
      
      // --- 资源包全量导入导出 (.svdata) ---
      exportBundle: (options: { 
        type: 'all' | 'custom', 
        projectIds?: number[], 
        inventoryIds?: number[] 
      }) => Promise<{ success: boolean, count: any } | null>

      scanBundle: (filePath: string) => Promise<ScanResult>
      
      executeImportBundle: (scanId: string, strategies: ImportStrategies) => Promise<{ success: boolean }>

      generateTemplate: (filePath: string) => Promise<{ success: boolean }>

      // --- 数据维护与清理 ---
      scanUnusedAssets: () => Promise<AssetScanResult>
      purgeUnusedAssets: (files: string[]) => Promise<PurgeResult>
      optimizeDatabase: () => Promise<{ orphansRemoved: number, vacuumed: boolean }>

      // --- 资源与系统设置 ---
      getStoragePath: () => Promise<string>
      openDataFolder: () => Promise<void>
      openFile: (relativePath: string) => Promise<void>
      showItemInFolder: (relativePath: string) => Promise<void>
      selectFolder: () => Promise<string | null>
      updateStoragePath: (newPath: string) => Promise<boolean>
      getAppVersion: () => Promise<string>
      saveAsset: (sourcePath: string, group: string, category: string) => Promise<string>
      saveBuffer: (buffer: ArrayBuffer, filename: string, group: string, category: string) => Promise<string>
      getFilePath: (file: File) => string

      // --- 自动备份设置 ---
      getAppSettings: () => Promise<AppSettings>
      saveAppSettings: (settings: AppSettings) => Promise<void>
    }
  }
}