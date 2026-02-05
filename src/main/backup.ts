import AdmZip from 'adm-zip'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { dbManager } from './db'
import { randomUUID, createHash } from 'crypto'

interface ExportOptions {
  type: 'all' | 'custom'
  projectIds?: number[]
  inventoryIds?: number[]
}

interface BackupMeta {
  version: string
  createdAt: number
  inventory: any[]
  projects: any[]
  projectItems: any[]
}

type ImportStrategies = Record<number, 'skip' | 'overwrite' | 'keep_both'>

interface ConflictItem {
  local: any
  remote: any
  hasFileDiff: boolean
}

interface ScanResult {
  scanId: string
  meta: BackupMeta
  conflicts: {
    inventory: ConflictItem[]
    projects: ConflictItem[]
  }
  newItems: {
    inventory: number
    projects: number
  }
}

class BackupManager {
  
  private tempSessions = new Map<string, string>()

  private calculateFileHash(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) return ''
      const fileBuffer = fs.readFileSync(filePath)
      const hashSum = createHash('md5')
      hashSum.update(fileBuffer)
      return hashSum.digest('hex')
    } catch (e) {
      return ''
    }
  }

  public async exportBundle(filePath: string, options: ExportOptions) {
    try {
      const zip = new AdmZip()
      const assetsRoot = path.join(dbManager.getStoragePath(), 'assets')
      const db = dbManager.getDb()
      
      let inventoryList: any[] = []
      let projectList: any[] = []
      let projectItemsList: any[] = []

      if (options.type === 'all') {
        inventoryList = dbManager.getAllInventoryForExport()
        const allProjs = dbManager.getAllProjectsForExport()
        projectList = allProjs.map(p => {
          const { id, name, description, created_at, order_index, files } = p
          return { id, name, description, created_at, order_index, files }
        })
        projectItemsList = db.prepare("SELECT * FROM project_items").all() as any[]
      } else {
        const targetInventoryIds = new Set(options.inventoryIds || [])
        
        if (options.projectIds && options.projectIds.length > 0) {
          for (const pid of options.projectIds) {
            const proj = db.prepare("SELECT * FROM projects WHERE id = ?").get(pid) as any
            if (proj) projectList.push(proj)

            const items = db.prepare("SELECT * FROM project_items WHERE project_id = ?").all(pid) as any[]
            projectItemsList.push(...items)

            items.forEach(item => targetInventoryIds.add(item.inventory_id))
          }
        }

        if (targetInventoryIds.size > 0) {
          const ids = Array.from(targetInventoryIds).join(',')
          inventoryList = db.prepare(`SELECT * FROM inventory WHERE id IN (${ids})`).all() as any[]
        }
      }

      const packedFiles = new Set<string>()

      const addFileToZip = (rawPaths: string) => {
        if (!rawPaths) return
        try {
          const paths = JSON.parse(rawPaths)
          if (Array.isArray(paths)) {
            for (const relativePath of paths) {
              if (packedFiles.has(relativePath)) continue 

              const fullPath = path.join(assetsRoot, relativePath)
              if (fs.existsSync(fullPath)) {
                const zipPath = path.join('assets', path.dirname(relativePath)).replace(/\\/g, '/')
                zip.addLocalFile(fullPath, zipPath)
                packedFiles.add(relativePath)
              }
            }
          }
        } catch (e) { }
      }

      inventoryList.forEach(item => {
        addFileToZip(item.image_paths)
        addFileToZip(item.datasheet_paths)
      })

      projectList.forEach(proj => {
        addFileToZip(proj.files)
      })

      const meta: BackupMeta = {
        version: '2.0',
        createdAt: Date.now(),
        inventory: inventoryList,
        projects: projectList,
        projectItems: projectItemsList
      }

      zip.addFile("meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf8"))
      zip.writeZip(filePath)

      try {
        const csvContent = this.generateCsv(inventoryList)
        const csvPath = filePath.replace(/\.(svdata|zip)$/i, '') + '.csv'
        fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
      } catch (e) {
        console.error('伴生 CSV 生成失败', e)
      }

      // 记录导出操作日志
      dbManager.addLog({
        op_type: 'EXPORT',
        target_type: 'PROJECT', // 这里泛指项目/数据导出
        target_id: 0,
        desc: `导出资源包: ${path.basename(filePath)} (包含 ${inventoryList.length} 元件, ${projectList.length} 项目)`
      })

      return { 
        success: true, 
        count: { inventory: inventoryList.length, projects: projectList.length, files: packedFiles.size } 
      }

    } catch (e) {
      console.error('导出失败:', e)
      throw e
    }
  }

  public async scanBundle(filePath: string): Promise<ScanResult> {
    const scanId = randomUUID()
    const extractDir = path.join(os.tmpdir(), 'siliconvault_import', scanId)
    const db = dbManager.getDb()
    const assetsRoot = path.join(dbManager.getStoragePath(), 'assets')

    try {
      if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true })
      
      const fileBuffer = fs.readFileSync(filePath)
      const zip = new AdmZip(fileBuffer)
      
      zip.extractAllTo(extractDir, true)

      let workingDir = extractDir
      const rootMetaPath = path.join(extractDir, 'meta.json')
      
      if (!fs.existsSync(rootMetaPath)) {
        const subItems = fs.readdirSync(extractDir)
        const subDirs = subItems.filter(item => {
          try {
            return fs.statSync(path.join(extractDir, item)).isDirectory()
          } catch {
            return false
          }
        })

        if (subDirs.length === 1) {
          const potentialRoot = path.join(extractDir, subDirs[0])
          if (fs.existsSync(path.join(potentialRoot, 'meta.json'))) {
            workingDir = potentialRoot
          }
        }
      }

      this.tempSessions.set(scanId, workingDir)

      const metaPath = path.join(workingDir, 'meta.json')
      if (!fs.existsSync(metaPath)) throw new Error('无效的数据包：缺少 meta.json')
      
      const metaData = fs.readFileSync(metaPath, 'utf-8')
      const meta: BackupMeta = JSON.parse(metaData)

      const checkFilesDiff = (localJson: string, remoteJson: string): boolean => {
        try {
          const localPaths = JSON.parse(localJson || '[]')
          const remotePaths = JSON.parse(remoteJson || '[]')
          
          if (!Array.isArray(localPaths) || !Array.isArray(remotePaths)) return false
          
          if (localPaths.length !== remotePaths.length) return true
          
          const localHashes = new Set<string>()
          for (const lp of localPaths) {
             const lpFull = path.join(assetsRoot, lp)
             localHashes.add(this.calculateFileHash(lpFull))
          }

          for (const rp of remotePaths) {
            const normalizedRelPath = rp.replace(/\\/g, '/')
            const fileNameOnly = path.basename(normalizedRelPath)
            let srcFile = path.join(workingDir, 'assets', normalizedRelPath)
            if (!fs.existsSync(srcFile)) srcFile = path.join(workingDir, 'assets', fileNameOnly)
            
            const remoteHash = this.calculateFileHash(srcFile)
            
            if (remoteHash && !localHashes.has(remoteHash)) return true
          }
          
          return false
        } catch (e) { return false }
      }

      const conflictInventory: ConflictItem[] = []
      let newInventoryCount = 0

      for (const remoteItem of meta.inventory) {
        // 显式断言为 any，解决 Property 'image_paths' does not exist 错误
        const local = db.prepare(`
          SELECT * FROM inventory 
          WHERE name = ? AND package = ? AND value = ?
        `).get(remoteItem.name, remoteItem.package, remoteItem.value) as any

        if (local) {
          const hasImageDiff = checkFilesDiff(local.image_paths, remoteItem.image_paths)
          const hasDocDiff = checkFilesDiff(local.datasheet_paths, remoteItem.datasheet_paths)
          
          conflictInventory.push({ 
            local, 
            remote: remoteItem,
            hasFileDiff: hasImageDiff || hasDocDiff
          })
        } else {
          newInventoryCount++
        }
      }

      const conflictProjects: ConflictItem[] = []
      let newProjectCount = 0

      for (const remoteProj of meta.projects) {
        // 显式断言为 any，解决 Property 'files' does not exist 错误
        const local = db.prepare(`
          SELECT * FROM projects WHERE name = ?
        `).get(remoteProj.name) as any

        if (local) {
          const hasFileDiff = checkFilesDiff(local.files, remoteProj.files)
          conflictProjects.push({ 
            local, 
            remote: remoteProj,
            hasFileDiff
          })
        } else {
          newProjectCount++
        }
      }

      return {
        scanId,
        meta,
        conflicts: {
          inventory: conflictInventory,
          projects: conflictProjects
        },
        newItems: {
          inventory: newInventoryCount,
          projects: newProjectCount
        }
      }

    } catch (e) {
      console.error('扫描资源包失败:', e)
      this.cleanupTemp(scanId)
      throw e
    }
  }

  public async executeImport(scanId: string, strategies: { inventory: ImportStrategies, projects: ImportStrategies }) {
    const workingDir = this.tempSessions.get(scanId)
    if (!workingDir || !fs.existsSync(workingDir)) throw new Error('导入会话已过期')

    const db = dbManager.getDb()
    const assetsRoot = path.join(dbManager.getStoragePath(), 'assets')
    
    const inventoryIdMap = new Map<number, number>()
    const projectIdMap = new Map<number, number>()

    try {
      const meta: BackupMeta = JSON.parse(fs.readFileSync(path.join(workingDir, 'meta.json'), 'utf-8'))

      const importFiles = (rawPaths: string): string => {
        if (!rawPaths) return JSON.stringify([])
        try {
          const paths = JSON.parse(rawPaths)
          if (!Array.isArray(paths)) return JSON.stringify([])

          const newPaths: string[] = []
          for (const relPath of paths) {
            const normalizedRelPath = relPath.replace(/\\/g, '/')
            const fileNameOnly = path.basename(normalizedRelPath)
            
            let srcFile = path.join(workingDir, 'assets', normalizedRelPath)
            if (!fs.existsSync(srcFile)) {
                srcFile = path.join(workingDir, 'assets', fileNameOnly)
            }
            
            if (fs.existsSync(srcFile)) {
              let targetFileName = fileNameOnly
              let destFile = path.join(assetsRoot, targetFileName)

              if (fs.existsSync(destFile)) {
                 const srcHash = this.calculateFileHash(srcFile)
                 const localHash = this.calculateFileHash(destFile)

                 if (srcHash && localHash && srcHash === localHash) {
                    newPaths.push(targetFileName)
                    continue 
                 } else {
                    const ext = path.extname(fileNameOnly)
                    const name = path.basename(fileNameOnly, ext)
                    targetFileName = `${Date.now()}_${Math.floor(Math.random()*1000)}_${name}${ext}`
                    destFile = path.join(assetsRoot, targetFileName)
                 }
              }

              fs.copyFileSync(srcFile, destFile)
              newPaths.push(targetFileName)
            }
          }
          return JSON.stringify(newPaths)
        } catch (e) { 
          console.error('[BackupManager] 导入执行阶段严重崩溃:', e)
          return JSON.stringify([]) 
        }
      }

      const transaction = db.transaction(() => {
        
        for (const item of meta.inventory) {
          const strategy = strategies.inventory[item.id] || 'keep_both'
          
          const existing = db.prepare(`SELECT id FROM inventory WHERE name = ? AND package = ? AND value = ?`).get(item.name, item.package, item.value) as any

          if (existing && strategy === 'skip') {
            inventoryIdMap.set(item.id, existing.id)
            continue
          }

          const newImages = importFiles(item.image_paths)
          const newDatasheets = importFiles(item.datasheet_paths)

          if (existing && strategy === 'overwrite') {
            db.prepare(`
              UPDATE inventory SET 
              min_stock = ?, category = ?,
              image_paths = ?, datasheet_paths = ?
              WHERE id = ?
            `).run(
              item.min_stock, item.category,
              newImages, newDatasheets, 
              existing.id
            )
            inventoryIdMap.set(item.id, existing.id)
          } else {
            let finalName = item.name
            if (existing && strategy === 'keep_both') {
              finalName = `${item.name} (Imported)`
            }

            const initialQuantity = 0
            const initialLocation = ""

            const res = db.prepare(`
              INSERT INTO inventory (category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              item.category, finalName, item.value, item.package, initialQuantity, initialLocation, item.min_stock,
              newImages, newDatasheets
            )
            inventoryIdMap.set(item.id, Number(res.lastInsertRowid))
          }
        }

        for (const proj of meta.projects) {
          const strategy = strategies.projects[proj.id] || 'keep_both'
          const existing = db.prepare(`SELECT id FROM projects WHERE name = ?`).get(proj.name) as any

          if (existing && strategy === 'skip') {
            projectIdMap.set(proj.id, existing.id)
            continue
          }

          const newFiles = importFiles(proj.files)

          if (existing && strategy === 'overwrite') {
            db.prepare(`
              UPDATE projects SET description = ?, files = ? WHERE id = ?
            `).run(proj.description, newFiles, existing.id)
            projectIdMap.set(proj.id, existing.id)
          } else {
            let finalName = proj.name
            if (existing && strategy === 'keep_both') {
              finalName = `${proj.name} (Imported)`
            }
            const res = db.prepare(`
              INSERT INTO projects (name, description, created_at, files)
              VALUES (?, ?, ?, ?)
            `).run(finalName, proj.description, proj.created_at || new Date().toISOString(), newFiles)
            projectIdMap.set(proj.id, Number(res.lastInsertRowid))
          }
        }

        for (const [oldPid, newPid] of projectIdMap.entries()) {
          const strategy = strategies.projects[oldPid]
          if (strategy === 'overwrite') {
             db.prepare('DELETE FROM project_items WHERE project_id = ?').run(newPid)
          }
        }

        for (const link of meta.projectItems) {
          const newPid = projectIdMap.get(link.project_id)
          const newInvId = inventoryIdMap.get(link.inventory_id)

          if (newPid && newInvId) {
            const exists = db.prepare('SELECT 1 FROM project_items WHERE project_id = ? AND inventory_id = ?').get(newPid, newInvId)
            if (!exists) {
              db.prepare(`
                INSERT INTO project_items (project_id, inventory_id, quantity)
                VALUES (?, ?, ?)
              `).run(newPid, newInvId, link.quantity)
            }
          }
        }
      })

      transaction()

      // 记录导入操作日志
      const invCount = meta.inventory.length
      const projCount = meta.projects.length
      dbManager.addLog({
        op_type: 'IMPORT',
        target_type: 'INVENTORY', // 这里泛指数据导入
        target_id: 0,
        desc: `导入资源包 (Session: ${scanId.substring(0, 8)}) - 包含 ${invCount} 元件, ${projCount} 项目`
      })

      return { success: true }

    } catch (e) {
      console.error('导入执行阶段失败:', e)
      throw e
    } finally {
      this.cleanupTemp(scanId)
    }
  }

  public async generateTemplate(filePath: string) {
    try {
      const zip = new AdmZip()
      
      const demoMeta: BackupMeta = {
        version: '2.0',
        createdAt: Date.now(),
        inventory: [
          {
            id: 1001, 
            category: "Resistor",
            name: "Example Resistor",
            value: "10k 1%",
            package: "0805",
            quantity: 500,
            location: "Box-A-01",
            min_stock: 50,
            image_paths: JSON.stringify(["example_resistor.png"]),
            datasheet_paths: JSON.stringify(["datasheet.pdf"])
          }
        ],
        projects: [
          {
            id: 2001,
            name: "Demo Project (LED Blinker)",
            description: "This is a sample project to show how import works.",
            created_at: new Date().toISOString(),
            files: JSON.stringify([
                "schematic.pdf", 
                "design_draft.png", 
                "requirements.docx"
            ])
          }
        ],
        projectItems: [
          {
            project_id: 2001,
            inventory_id: 1001,
            quantity: 2
          }
        ]
      }

      zip.addFile("meta.json", Buffer.from(JSON.stringify(demoMeta, null, 2), "utf8"))

      const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', 'base64')
      
      zip.addFile("assets/example_resistor.png", dummyPng)
      zip.addFile("assets/datasheet.pdf", Buffer.from("Dummy PDF Content", "utf8"))
      
      zip.addFile("assets/schematic.pdf", Buffer.from("Dummy Schematic", "utf8"))
      zip.addFile("assets/design_draft.png", dummyPng) 
      zip.addFile("assets/requirements.docx", Buffer.from("Dummy Word Doc", "utf8"))

      zip.writeZip(filePath)

      return { success: true }
    } catch (e) {
      console.error('模板生成失败:', e)
      throw e
    }
  }

  private cleanupTemp(scanId: string) {
    const dir = this.tempSessions.get(scanId)
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (e) { console.error('临时文件清理失败', e) }
    }
    this.tempSessions.delete(scanId)
  }

  private generateCsv(items: any[]): string {
    const headers = ['Category', 'Name', 'Value', 'Package', 'Quantity', 'Location', 'MinStock']
    const rows = items.map(item => {
      return [
        item.category,
        item.name,
        item.value,
        item.package,
        item.quantity,
        item.location,
        item.min_stock
      ].map(val => {
        const str = String(val || '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    })
    
    return [headers.join(','), ...rows].join('\n')
  }
}

export const backupManager = new BackupManager()