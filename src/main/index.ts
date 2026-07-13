import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join, basename, extname, isAbsolute, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { dbManager } from './db'
import { backupManager } from './backup'
import { maintenanceManager } from './maintenance'
import fs from 'fs'
import Store from 'electron-store'
import { pathToFileURL } from 'url' 
import { randomUUID } from 'crypto'
import { analyticsManager } from './analytics'
import {
  getRuntimeEnvironment,
  isDevelopmentStorageMode,
  isDevelopmentStoragePath
} from './environment'
import {
  assertSafeAbsoluteDirectory,
  ensureDirectoryWithin,
  resolveExistingFileWithin,
  sanitizePathSegment
} from './path-security'
import { migrateStorageDirectory } from './storage-migration'
import { decodeLocalResourceUrl } from '../shared/resource-url'
import type { CategoryRule } from '../shared/types'

const productionStore = isDevelopmentStorageMode() ? null : new Store()

let isDataDirty = false
let backupTimer: NodeJS.Timeout | null = null
let isStorageMigrationInProgress = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCategoryRule(value: unknown): value is CategoryRule {
  if (!isRecord(value)) return false

  const requiredFields = [
    'nameLabel',
    'namePlaceholder',
    'valueLabel',
    'valuePlaceholder',
    'packageLabel'
  ] as const
  if (!requiredFields.every((field) => typeof value[field] === 'string')) return false

  const layout = value.layout
  if (layout === undefined) return true
  if (Array.isArray(layout)) return layout.every((field) => typeof field === 'string')
  if (!isRecord(layout)) return false

  return ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].every(
    (field) => typeof layout[field] === 'string'
  )
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-resource',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 780,  
    minHeight: 620, 
    show: false,
    autoHideMenuBar: true,
    title: 'SiliconVault',
    icon: icon,
    titleBarStyle: 'hidden', 
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false 
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function markDataDirty(inventoryChanged = false): void {
  isDataDirty = true
  if (inventoryChanged) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('inventory-changed')
    }
  }
}

async function performAutoBackup(reason: string): Promise<void> {
  const settings = dbManager.getAppSettings()
  if (!settings.autoBackup) return

  if (reason === 'timer' && !isDataDirty) return
  if (reason === 'exit' && !isDataDirty) return

  try {
    const success = await backupManager.createAutoBackup(settings.backupPath)
    if (success) {
      console.log(`[AutoBackup] 备份成功 (${reason})`)
      isDataDirty = false
      await backupManager.cleanOldBackups(settings.backupPath, settings.maxBackups)
    }
  } catch (e) {
    console.error(`[AutoBackup] 备份失败 (${reason}):`, e)
  }
}

function scheduleBackupTimer(): void {
  if (backupTimer) clearInterval(backupTimer)
  
  const settings = dbManager.getAppSettings()
  if (!settings.autoBackup || settings.backupFrequency === 'exit') return

  let intervalMs = 0
  switch (settings.backupFrequency) {
    case '30min': intervalMs = 30 * 60 * 1000; break;
    case '1h': intervalMs = 60 * 60 * 1000; break;
    case '4h': intervalMs = 4 * 60 * 60 * 1000; break;
  }

  if (intervalMs > 0) {
    backupTimer = setInterval(() => {
      performAutoBackup('timer')
    }, intervalMs)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.maxtonniu.siliconvaultn')

  scheduleBackupTimer()

  protocol.handle('local-resource', (request) => {
    try {
      const decodedPath = decodeLocalResourceUrl(request.url)
      const assetsRoot = join(dbManager.getStoragePath(), 'assets')
      const filepath = resolveExistingFileWithin(assetsRoot, decodedPath)
      return net.fetch(pathToFileURL(filepath).toString())
    } catch (error) {
      console.error('资源加载失败:', error)
      return new Response('Resource not found', { status: 404 })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    switch (action) {
      case 'minimize': win.minimize(); break;
      case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case 'close': win.close(); break;
    }
  })

  // IPC 注册
  ipcMain.handle('get-categories', () => dbManager.fetchCategories())
  ipcMain.handle('get-packages', (_, category) => dbManager.fetchPackages(category))
  ipcMain.handle('get-inventory', (_, filters) => dbManager.fetchGrouped(filters))
  ipcMain.handle('get-inventory-health', () => dbManager.getInventoryHealthStats())
  
  ipcMain.handle('update-qty', (_, { id, qty }) => {
    dbManager.updateQty(id, qty)
    markDataDirty(true)
  })

  ipcMain.handle('batch-update-qty', (_, updates) => {
    dbManager.batchUpdateQty(updates)
    markDataDirty(true)
  })
  
  ipcMain.handle('delete-item', (_, id) => {
    dbManager.deleteItem(id)
    markDataDirty(true)
  })
  
  ipcMain.handle('upsert-item', (_, data) => {
    dbManager.upsert(data)
    markDataDirty(true)
  })

  ipcMain.handle('get-projects', (_, { query, ids } = {}) => dbManager.getProjects(query, ids))
  ipcMain.handle('get-related-projects', (_, id) => dbManager.getRelatedProjects(id))
  ipcMain.handle('get-project-detail', (_, id) => dbManager.getProjectDetail(id))
  
  ipcMain.handle('save-project', (_, project) => {
    dbManager.saveProject(project)
    markDataDirty()
  })
  
  ipcMain.handle('delete-project', (_, id) => {
    dbManager.deleteProject(id)
    markDataDirty()
  })
  
  ipcMain.handle('execute-deduction', (_, payload) => {
    const items = Array.isArray(payload) ? payload : payload?.items
    const context = Array.isArray(payload) ? undefined : payload?.context
    dbManager.executeDeduction(items, context)
    markDataDirty(true)
  })

  ipcMain.handle('get-category-rule', (_, cat) => dbManager.getCategoryRule(cat))
  ipcMain.handle('get-all-category-rules', () => dbManager.getAllCategoryRules())
  
  ipcMain.handle('save-category-rule', async (_event, ...args: unknown[]) => {
    let category: string | undefined
    let rule: CategoryRule | undefined

    if (args.length >= 2 && typeof args[0] === 'string' && isCategoryRule(args[1])) {
      category = args[0]
      rule = args[1]
    } else if (args.length === 1 && isRecord(args[0])) {
      const params = args[0]
      const categoryValue = params.category ?? params.cat
      if (typeof categoryValue === 'string' && isCategoryRule(params.rule)) {
        category = categoryValue
        rule = params.rule
      }
    }

    if (!category || !rule) {
      throw new Error('参数解析失败')
    }

    return dbManager.saveCategoryRule(category, rule)
  })
  
  ipcMain.handle('reset-category-rule', (_, cat) => dbManager.resetCategoryRule(cat))
  ipcMain.handle('update-sort-order', (_, { table, ids }) => dbManager.updateSortOrder(table, ids))

  ipcMain.handle('get-logs', () => dbManager.getLogs())
  
  ipcMain.handle('undo-operation', (_, logId) => {
    dbManager.undoOperation(logId)
    markDataDirty(true)
  })

  // 修改：支持接收 title 和 filterName
  ipcMain.handle('export-data', async (_, { title, content, filename, filterName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: title || 'Export Data',
      defaultPath: filename || 'export.csv',
      filters: [{ name: filterName || 'CSV File', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return false
    try {
      fs.writeFileSync(filePath, '\uFEFF' + content, 'utf-8')
      return true
    } catch (e) {
      console.error('导出失败', e)
      throw e
    }
  })

  // 修改：支持接收 title 和 filterName
  ipcMain.handle('read-file-text', async (_, { title, filterName } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: title,
      properties: ['openFile'],
      filters: [{ name: filterName || 'CSV File', extensions: ['csv'] }]
    })
    if (canceled || filePaths.length === 0) return null
    try {
      return fs.readFileSync(filePaths[0], 'utf-8')
    } catch (e) {
      console.error('读取失败', e)
      throw e
    }
  })

  ipcMain.handle('get-all-inventory-export', () => dbManager.getAllInventoryForExport())
  ipcMain.handle('get-all-projects-export', () => dbManager.getAllProjectsForExport())
  
  ipcMain.handle('batch-import-inventory', (_, { items, mode }) => {
    const result = dbManager.batchImportInventory(items, mode)
    markDataDirty(true)
    return result
  })

  ipcMain.handle('get-storage-path', () => dbManager.getStoragePath())
  ipcMain.handle('get-runtime-environment', () => getRuntimeEnvironment())
  ipcMain.handle('open-data-folder', () => { shell.openPath(dbManager.getStoragePath()) })
  
  ipcMain.handle('open-file', async (_, relativePath) => {
    if (!relativePath) return
    const assetsRoot = join(dbManager.getStoragePath(), 'assets')
    const fullPath = resolveExistingFileWithin(assetsRoot, relativePath)
    const openError = await shell.openPath(fullPath)
    if (openError) throw new Error(`OPEN_FILE_FAILED:${openError}`)
  })

  ipcMain.handle('show-item-in-folder', (_, relativePath) => {
    if (!relativePath) return
    const assetsRoot = join(dbManager.getStoragePath(), 'assets')
    const fullPath = resolveExistingFileWithin(assetsRoot, relativePath)
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle('save-asset', async (_, { sourcePath, group, category }) => {
    try {
      if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) {
        throw new Error('INVALID_SOURCE_PATH')
      }
      const resolvedSource = resolve(sourcePath)
      const sourceStat = fs.statSync(resolvedSource)
      if (!sourceStat.isFile()) throw new Error('INVALID_SOURCE_FILE')

      const assetsRoot = join(dbManager.getStoragePath(), 'assets')
      fs.mkdirSync(assetsRoot, { recursive: true })
      const safeGroup = sanitizePathSegment(group, 'misc')
      const safeCategory = sanitizePathSegment(category, 'uncategorized')
      const relativeDir = `${safeGroup}/${safeCategory}`
      const assetsDir = ensureDirectoryWithin(assetsRoot, relativeDir)

      const safeOriginal = sanitizePathSegment(basename(resolvedSource), 'asset')
      const ext = extname(safeOriginal)
      const name = sanitizePathSegment(basename(safeOriginal, ext), 'asset')
      const newFilename = `${randomUUID()}_${name}${ext}`
      const targetPath = join(assetsDir, newFilename)

      fs.copyFileSync(resolvedSource, targetPath, fs.constants.COPYFILE_EXCL)
      return `${relativeDir}/${newFilename}`
    } catch (e) {
      console.error('资源保存失败', e)
      throw e
    }
  })

  ipcMain.handle('save-buffer', async (_, { buffer, filename, group, category }) => {
    try {
      const fileBuffer = Buffer.from(buffer)
      if (fileBuffer.length === 0 || fileBuffer.length > 100 * 1024 * 1024) {
        throw new Error('INVALID_BUFFER_SIZE')
      }

      const assetsRoot = join(dbManager.getStoragePath(), 'assets')
      fs.mkdirSync(assetsRoot, { recursive: true })
      const safeGroup = sanitizePathSegment(group, 'misc')
      const safeCategory = sanitizePathSegment(category, 'uncategorized')
      const relativeDir = `${safeGroup}/${safeCategory}`
      const assetsDir = ensureDirectoryWithin(assetsRoot, relativeDir)

      const safeOriginal = sanitizePathSegment(filename, 'asset.png')
      const ext = extname(safeOriginal) || '.png'
      const name = sanitizePathSegment(basename(safeOriginal, ext), 'asset')
      const newFilename = `${randomUUID()}_${name}${ext}`
      const targetPath = join(assetsDir, newFilename)

      fs.writeFileSync(targetPath, fileBuffer, { flag: 'wx' })
      return `${relativeDir}/${newFilename}`
    } catch (e) {
      console.error('Buffer 保存失败', e)
      throw e
    }
  })

  // 修改：支持接收 title 和 buttonLabel
  ipcMain.handle('select-folder', async (_, { title, buttonLabel } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ 
      title: title,
      buttonLabel: buttonLabel,
      properties: ['openDirectory'] 
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('update-storage-path', async (_, newPath) => {
    if (isStorageMigrationInProgress) throw new Error('STORAGE_MIGRATION_ALREADY_RUNNING')
    isStorageMigrationInProgress = true
    try {
      if (isDevelopmentStorageMode()) {
        throw new Error('Development storage is locked and cannot be migrated')
      }
      if (!productionStore) {
        throw new Error('Production configuration store is unavailable')
      }
      const validatedPath = assertSafeAbsoluteDirectory(newPath)
      if (isDevelopmentStoragePath(validatedPath)) {
        throw new Error('Development storage cannot be selected by a production build')
      }

      const oldPath = dbManager.getStoragePath()
      const result = await migrateStorageDirectory(dbManager.getDb(), oldPath, validatedPath)
      productionStore.set('storagePath', result.targetPath)
      app.relaunch()
      app.exit()
      return result
    } catch (e) {
      console.error('迁移失败', e)
      throw e
    } finally {
      isStorageMigrationInProgress = false
    }
  })

  ipcMain.handle('generate-template', async (_event, filePath) => {
    return await backupManager.generateTemplate(filePath)
  })

  // 修改：支持接收 title 和 filterName
  ipcMain.handle('export-bundle', async (_, options) => {
    const { title, filterName, ...restOptions } = options || {}
    
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: title || 'Export Business Resource Bundle',
      defaultPath: `ResourceBundle_${new Date().toISOString().split('T')[0]}.svdata`,
      filters: [{ name: filterName || 'SiliconVault Business Bundle', extensions: ['svdata'] }]
    })
    
    if (canceled || !filePath) return null
    try {
      return await backupManager.exportBundle(filePath, restOptions)
    } catch (e) {
      console.error(e)
      throw e
    }
  })

  ipcMain.handle('scan-bundle', async (_, filePath) => {
    try {
      return await backupManager.scanBundle(filePath)
    } catch (e) {
      console.error('扫描失败', e)
      throw e
    }
  })

  ipcMain.handle('execute-import-bundle', async (_, { scanId, strategies }) => {
    try {
      const result = await backupManager.executeImport(scanId, strategies)
      markDataDirty(true)
      return result
    } catch (e) {
      console.error('导入执行失败', e)
      throw e
    }
  })

  ipcMain.handle('get-app-settings', () => dbManager.getAppSettings())
  
  ipcMain.handle('save-app-settings', (_, settings) => {
    const safeSettings = {
      ...settings,
      backupPath: isDevelopmentStorageMode()
        ? dbManager.getAppSettings().backupPath
        : backupManager.validateBackupDirectory(settings?.backupPath)
    }
    dbManager.saveAppSettings(safeSettings)
    scheduleBackupTimer()
  })

  ipcMain.handle('get-consumption-stats', (_, { range, useMock }) => {
    return analyticsManager.getConsumptionStats(range, useMock)
  })

  ipcMain.handle('scan-unused-assets', async () => {
    return maintenanceManager.scanUnusedAssets()
  })

  ipcMain.handle('purge-unused-assets', async (_, files) => {
    return maintenanceManager.purgeAssets(files)
  })

  ipcMain.handle('get-maintenance-diagnostics', async () => {
    return maintenanceManager.getMaintenanceDiagnostics()
  })

  ipcMain.handle('optimize-database', async () => {
    return maintenanceManager.optimizeDatabase()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async (event) => {
  const settings = dbManager.getAppSettings()
  
  if (settings.autoBackup && isDataDirty) {
    event.preventDefault()
    console.log('[AutoBackup] 正在执行退出备份...')
    await performAutoBackup('exit')
    console.log('[AutoBackup] 退出备份完成，正在关闭应用。')
    app.exit(0)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
