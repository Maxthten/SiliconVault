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
  ref_count?: number
}

export interface InventoryImportItem {
  category?: string | null
  name?: string | null
  value?: string | null
  package?: string | null
  quantity?: number | string | null
  location?: string | null
  min_stock?: number | string | null
}

export type StoredInventoryItem = InventoryItem & { id: number }

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

export interface ProjectItemLink {
  project_id: number
  inventory_id: number
  quantity: number
}

export type BundleInventoryItem = StoredInventoryItem
export type BundleProject = BomProject & { id: number }

export interface FilterOptions {
  keyword?: string
  category?: string
  package?: string
}

export interface InventoryHealthStats {
  total: number
  outOfStock: number
  lowStock: number
  warningLevel: 0 | 1 | 2
}

export interface CategoryLayout {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

export interface CategoryRule {
  nameLabel: string
  namePlaceholder: string
  valueLabel: string
  valuePlaceholder: string
  packageLabel: string
  layout?: CategoryLayout | string[]
}

export type OperationEventCode =
  | 'INVENTORY_CREATE'
  | 'INVENTORY_UPDATE'
  | 'INVENTORY_DELETE'
  | 'INVENTORY_MANUAL_IN'
  | 'INVENTORY_MANUAL_OUT'
  | 'INVENTORY_BATCH_ADJUST'
  | 'BOM_PRODUCTION_DEDUCTION'
  | 'PROJECT_CREATE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_DELETE'
  | 'CSV_IMPORT'
  | 'BUNDLE_IMPORT'
  | 'BUNDLE_EXPORT'
  | 'FULL_BACKUP_CREATE'
  | 'LEGACY'

export interface OperationLog {
  id: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT' | 'SYSTEM'
  target_id: number
  event_code?: OperationEventCode
  summary_key?: string
  summary_params?: string
  details?: string
  undoable: number
  undone_at?: string | null
  desc?: string
  old_data?: string
  new_data?: string
  created_at: string
}

export type NewOperationLog = Omit<OperationLog, 'id' | 'created_at' | 'undoable'> & {
  id?: number
  created_at?: string
  undoable?: number
}

export interface AppSettings {
  autoBackup: boolean
  backupFrequency: 'exit' | '30min' | '1h' | '4h'
  backupPath: string
  maxBackups: number
}

export interface RuntimeEnvironment {
  mode: 'development' | 'production'
  isDevelopment: boolean
  storagePathLocked: boolean
}

export type ImportStrategy = 'skip' | 'overwrite' | 'keep_both'

export interface ImportStrategies {
  inventory: Record<number, ImportStrategy>
  projects: Record<number, ImportStrategy>
}

export interface QuantityUpdate {
  id: number
  qty: number
}

export interface DeductionItem {
  id: number
  deductQty: number
}

export interface DeductionContext {
  projectId?: number
  projectName?: string
  productionQuantity?: number
  allowNegative?: boolean
}

export interface BusinessBundleMeta {
  format?: 'siliconvault-business-bundle'
  kind?: 'business-bundle'
  version: string
  createdAt: number
  inventory: BundleInventoryItem[]
  projects: BundleProject[]
  projectItems: ProjectItemLink[]
}

export interface BundleConflict<T> {
  local: T
  remote: T
  hasFileDiff?: boolean
}

export interface BundleScanResult {
  scanId: string
  meta: BusinessBundleMeta
  conflicts: {
    inventory: Array<BundleConflict<InventoryItem>>
    projects: Array<BundleConflict<BomProject>>
  }
  newItems: {
    inventory: number
    projects: number
  }
}

export type ScanResult = BundleScanResult

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
  scannedFiles: number
  referencedFiles: number
  missingReferencedFiles: string[]
  invalidReferences: number
  skippedEntries: number
}

export interface PurgeResult {
  successCount: number
  failCount: number
  skippedReferenced: number
  freedSpace: number
  removedDirectories: number
}

export interface MaintenanceDiagnostics {
  integrityCheck: string
  foreignKeyViolations: number
  orphanProjectItems: number
  databaseSize: number
  walSize: number
  pageCount: number
  pageSize: number
  freelistPages: number
  reclaimableBytes: number
  assetScan: AssetScanResult
}

export interface DatabaseOptimizationResult {
  integrityCheck: string
  foreignKeyViolations: number
  orphansRemoved: number
  vacuumed: boolean
  checkpointed: boolean
  databaseSizeBefore: number
  databaseSizeAfter: number
  reclaimedBytes: number
}

export interface ConsumptionData {
  summary: {
    totalQuantity: number
    topCategory: string
    activeProject: string
    intensity: 'low' | 'medium' | 'high'
  }
  timeline: Array<{ date: string; value: number }>
  categories: Array<{ name: string; value: number }>
  heatmap: Array<{ date: string; count: number }>
  ranking: Array<{
    name: string
    category: string
    value: number
    originalValue?: string
    package?: string
  }>
}

export interface ExportDataOptions {
  title: string
  filename: string
  content: string
  filterName?: string
}

export interface FileDialogOptions {
  title?: string
  filterName?: string
}

export interface FolderDialogOptions {
  title?: string
  buttonLabel?: string
}

export interface ExportBundleOptions {
  type: 'all' | 'custom'
  projectIds?: number[]
  inventoryIds?: number[]
  title?: string
  filterName?: string
}

export interface ExportBundleResult {
  success: boolean
  count: {
    inventory: number
    projects: number
    files: number
  }
}

export interface StorageMigrationResult {
  targetPath: string
  copiedBytes: number
  integrityCheck: 'ok'
}

export interface SiliconVaultAPI {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>
  fetchCategories: () => Promise<string[]>
  fetchPackages: (category?: string) => Promise<string[]>
  fetchInventory: (filters: FilterOptions) => Promise<Record<string, InventoryItem[]>>
  getInventoryHealth: () => Promise<InventoryHealthStats>
  updateQty: (id: number, qty: number) => Promise<void>
  batchUpdateQty: (updates: QuantityUpdate[]) => Promise<void>
  onInventoryChanged: (callback: () => void) => () => void
  deleteItem: (id: number) => Promise<void>
  upsertItem: (data: InventoryItem) => Promise<void>
  getProjects: (query?: string, ids?: number[]) => Promise<BomProject[]>
  getRelatedProjects: (id: number) => Promise<Array<{ id: number; name: string }>>
  getProjectDetail: (id: number) => Promise<BomItem[]>
  saveProject: (project: BomProject) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  executeDeduction: (items: DeductionItem[], context?: DeductionContext) => Promise<void>
  updateSortOrder: (table: 'projects' | 'inventory', ids: number[]) => Promise<void>
  getCategoryRule: (category: string) => Promise<CategoryRule>
  getAllCategoryRules: () => Promise<Record<string, CategoryRule>>
  saveCategoryRule: (category: string, rule: CategoryRule) => Promise<void>
  resetCategoryRule: (category: string) => Promise<void>
  getLogs: () => Promise<OperationLog[]>
  undoOperation: (logId: number) => Promise<void>
  getConsumptionStats: (
    range: 'day' | 'week' | 'month',
    useMock: boolean
  ) => Promise<ConsumptionData>
  exportData: (payload: ExportDataOptions) => Promise<boolean>
  readFileText: (options?: FileDialogOptions) => Promise<string | null>
  getAllInventoryExport: () => Promise<InventoryItem[]>
  getAllProjectsExport: () => Promise<BomProject[]>
  batchImportInventory: (
    items: InventoryImportItem[],
    mode: ImportStrategy
  ) => Promise<{ success: number; skipped: number }>
  exportBundle: (options: ExportBundleOptions) => Promise<ExportBundleResult | null>
  scanBundle: (filePath: string) => Promise<BundleScanResult>
  executeImportBundle: (
    scanId: string,
    strategies: ImportStrategies
  ) => Promise<{ success: boolean }>
  generateTemplate: (filePath: string) => Promise<{ success: boolean }>
  getStoragePath: () => Promise<string>
  getRuntimeEnvironment: () => Promise<RuntimeEnvironment>
  openDataFolder: () => Promise<void>
  openFile: (relativePath: string) => Promise<void>
  showItemInFolder: (relativePath: string) => Promise<void>
  saveAsset: (sourcePath: string, group: string, category: string) => Promise<string>
  saveBuffer: (
    buffer: ArrayBuffer,
    filename: string,
    group: string,
    category: string
  ) => Promise<string>
  selectFolder: (options?: FolderDialogOptions) => Promise<string | null>
  updateStoragePath: (newPath: string) => Promise<StorageMigrationResult>
  scanUnusedAssets: () => Promise<AssetScanResult>
  purgeUnusedAssets: (files: string[]) => Promise<PurgeResult>
  getMaintenanceDiagnostics: () => Promise<MaintenanceDiagnostics>
  optimizeDatabase: () => Promise<DatabaseOptimizationResult>
  getAppVersion: () => Promise<string>
  getFilePath: (file: File) => string
  getAppSettings: () => Promise<AppSettings>
  saveAppSettings: (settings: AppSettings) => Promise<void>
}
