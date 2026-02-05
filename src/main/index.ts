import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join, basename, extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { dbManager } from './db'
import { backupManager } from './backup'
import { maintenanceManager } from './maintenance'
import fs from 'fs'
import Store from 'electron-store'
import { pathToFileURL } from 'url' 

const store = new Store()

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
    show: false,
    autoHideMenuBar: true,
    title: 'SiliconVault',
    icon: icon,
    
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.maxtonniu.siliconvaultn')

  protocol.handle('local-resource', (request) => {
    const url = request.url.replace('local-resource://', '')
    const cleanUrl = url.replace(/\/$/, '')
    const decodedUrl = decodeURIComponent(cleanUrl)
    
    try {
      const filepath = join(dbManager.getStoragePath(), 'assets', decodedUrl)
      return net.fetch(pathToFileURL(filepath).toString())
    } catch (error) {
      console.error('资源加载失败:', error)
      return new Response('404', { status: 404 })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ===============================================
  //  IPC API 注册区域
  // ===============================================

  // --- 库存管理 ---
  ipcMain.handle('get-categories', () => dbManager.fetchCategories())
  ipcMain.handle('get-packages', (_, category) => dbManager.fetchPackages(category))
  ipcMain.handle('get-inventory', (_, filters) => dbManager.fetchGrouped(filters))
  ipcMain.handle('update-qty', (_, { id, qty }) => dbManager.updateQty(id, qty))
  ipcMain.handle('delete-item', (_, id) => dbManager.deleteItem(id))
  ipcMain.handle('upsert-item', (_, data) => dbManager.upsert(data))

  // --- BOM 项目管理 ---
  ipcMain.handle('get-projects', (_, query) => dbManager.getProjects(query))
  ipcMain.handle('get-project-detail', (_, id) => dbManager.getProjectDetail(id))
  ipcMain.handle('save-project', (_, project) => dbManager.saveProject(project))
  ipcMain.handle('delete-project', (_, id) => dbManager.deleteProject(id))
  ipcMain.handle('execute-deduction', (_, items) => dbManager.executeDeduction(items))

  // --- 规则与排序 ---
  ipcMain.handle('get-category-rule', (_, cat) => dbManager.getCategoryRule(cat))
  ipcMain.handle('save-category-rule', (_, { cat, rule }) => dbManager.saveCategoryRule(cat, rule))
  ipcMain.handle('reset-category-rule', (_, cat) => dbManager.resetCategoryRule(cat))
  ipcMain.handle('update-sort-order', (_, { table, ids }) => dbManager.updateSortOrder(table, ids))

  // --- 日志 ---
  ipcMain.handle('get-logs', () => dbManager.getLogs())
  ipcMain.handle('undo-operation', (_, logId) => dbManager.undoOperation(logId))

  // --- CSV 导出 ---
  ipcMain.handle('export-data', async (_, { title, content, filename }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: title || '导出数据',
      defaultPath: filename || 'export.csv',
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
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

  // --- CSV 导入 ---
  ipcMain.handle('read-file-text', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
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
  ipcMain.handle('batch-import-inventory', (_, { items, mode }) => dbManager.batchImportInventory(items, mode))

  // --- 系统与路径 ---
  ipcMain.handle('get-storage-path', () => dbManager.getStoragePath())
  ipcMain.handle('open-data-folder', () => { shell.openPath(dbManager.getStoragePath()) })
  
  ipcMain.handle('open-file', (_, relativePath) => {
    if (!relativePath) return
    const fullPath = join(dbManager.getStoragePath(), 'assets', relativePath)
    shell.openPath(fullPath)
  })

  ipcMain.handle('show-item-in-folder', (_, relativePath) => {
    if (!relativePath) return
    const fullPath = join(dbManager.getStoragePath(), 'assets', relativePath)
    shell.showItemInFolder(fullPath)
  })

  // --- 资源保存 ---
  ipcMain.handle('save-asset', async (_, { sourcePath, group, category }) => {
    try {
      const storagePath = dbManager.getStoragePath()
      const safeGroup = (group || 'misc').replace(/[\\/:*?"<>|]/g, '_')
      const safeCategory = (category || 'uncategorized').replace(/[\\/:*?"<>|]/g, '_')
      const relativeDir = join(safeGroup, safeCategory)
      const assetsDir = join(storagePath, 'assets', relativeDir)

      if (!fs.existsSync(assetsDir)) { fs.mkdirSync(assetsDir, { recursive: true }) }

      const ext = extname(sourcePath)
      const name = basename(sourcePath, ext)
      const newFilename = `${Date.now()}_${name}${ext}`
      const targetPath = join(assetsDir, newFilename)

      fs.copyFileSync(sourcePath, targetPath)
      return join(relativeDir, newFilename).replace(/\\/g, '/')
    } catch (e) {
      console.error('资源保存失败', e)
      throw e
    }
  })

  ipcMain.handle('save-buffer', async (_, { buffer, filename, group, category }) => {
    try {
      const storagePath = dbManager.getStoragePath()
      const safeGroup = (group || 'misc').replace(/[\\/:*?"<>|]/g, '_')
      const safeCategory = (category || 'uncategorized').replace(/[\\/:*?"<>|]/g, '_')
      const relativeDir = join(safeGroup, safeCategory)
      const assetsDir = join(storagePath, 'assets', relativeDir)

      if (!fs.existsSync(assetsDir)) { fs.mkdirSync(assetsDir, { recursive: true }) }

      const ext = extname(filename) || '.png' 
      const name = basename(filename, ext)
      const newFilename = `${Date.now()}_${name}${ext}`
      const targetPath = join(assetsDir, newFilename)

      fs.writeFileSync(targetPath, Buffer.from(buffer))
      return join(relativeDir, newFilename).replace(/\\/g, '/')
    } catch (e) {
      console.error('Buffer 保存失败', e)
      throw e
    }
  })

  ipcMain.handle('select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('update-storage-path', async (_, newPath) => {
    try {
      const oldPath = dbManager.getStoragePath()
      if (oldPath === newPath) return true
      fs.cpSync(oldPath, newPath, { recursive: true, force: false })
      store.set('storagePath', newPath)
      app.relaunch()
      app.exit()
      return true
    } catch (e) {
      console.error('迁移失败', e)
      throw e
    }
  })

  // --- 资源包 (Backup/Restore) ---
  
  ipcMain.handle('generate-template', async (_event, filePath) => {
    return await backupManager.generateTemplate(filePath)
  })

  ipcMain.handle('export-bundle', async (_, options) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出全量备份/资源包',
      defaultPath: `Backup_${new Date().toISOString().split('T')[0]}.svdata`,
      filters: [{ name: 'SiliconVault 数据包', extensions: ['svdata'] }]
    })
    
    if (canceled || !filePath) return null
    try {
      return await backupManager.exportBundle(filePath, options)
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
      return await backupManager.executeImport(scanId, strategies)
    } catch (e) {
      console.error('导入执行失败', e)
      throw e
    }
  })

  // --- 数据维护与清理 ---
  ipcMain.handle('scan-unused-assets', async () => {
    return maintenanceManager.scanUnusedAssets()
  })

  ipcMain.handle('purge-unused-assets', async (_, files) => {
    return maintenanceManager.purgeAssets(files)
  })

  ipcMain.handle('optimize-database', async () => {
    return maintenanceManager.optimizeDatabase()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})