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

import AdmZip from 'adm-zip'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { dbManager, type DBManager } from './db'
import { randomUUID, createHash } from 'crypto'
import {
  assertSafeAbsoluteDirectory,
  isPathInside,
  normalizeRelativePath,
  resolveCanonicalPath,
  resolveExistingFileWithin,
  resolvePathWithin,
  sanitizePathSegment
} from './path-security'
import type {
  BundleInventoryItem,
  BundleProject,
  BundleScanResult,
  BusinessBundleMeta,
  ExportBundleOptions,
  ExportBundleResult,
  ImportStrategies,
  InventoryItem,
  ProjectItemLink
} from '../shared/types'

const BUSINESS_BUNDLE_FORMAT = 'siliconvault-business-bundle'
const BUSINESS_BUNDLE_VERSION = '3.0'
const LEGACY_BUNDLE_VERSION = '2.0'
const FULL_BACKUP_FORMAT = 'siliconvault-full-backup'
const FULL_BACKUP_VERSION = '1.0'
const MAX_BUNDLE_SIZE = 2 * 1024 * 1024 * 1024
const MAX_ENTRY_SIZE = 512 * 1024 * 1024
const MAX_ENTRY_COUNT = 20_000
const MAX_META_SIZE = 128 * 1024 * 1024
const TEMP_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000

interface FullBackupManifest {
  format: typeof FULL_BACKUP_FORMAT
  kind: 'full-application-backup'
  version: typeof FULL_BACKUP_VERSION
  createdAt: number
  database: string
  assetsRoot: string
}

interface TempSession {
  extractRoot: string
  workingDir: string
  createdAt: number
}

export class BackupManager {

  private tempSessions = new Map<string, TempSession>()

  constructor(private readonly databaseManager: DBManager = dbManager) {
    this.cleanupExpiredImportDirectories()
  }

  private calculateFileHash(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) return ''
      const fileBuffer = fs.readFileSync(filePath)
      const hashSum = createHash('md5')
      hashSum.update(fileBuffer)
      return hashSum.digest('hex')
    } catch {
      return ''
    }
  }

  public validateBackupDirectory(targetDir: string): string {
    const safeTargetDir = assertSafeAbsoluteDirectory(targetDir)
    const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
    const canonicalAssetsRoot = resolveCanonicalPath(assetsRoot)
    const canonicalTargetDir = resolveCanonicalPath(safeTargetDir)
    if (isPathInside(canonicalAssetsRoot, canonicalTargetDir)) {
      throw new Error('BACKUP_PATH_INSIDE_ASSETS')
    }
    return safeTargetDir
  }

  public async createAutoBackup(targetDir: string): Promise<boolean> {
    try {
      const safeTargetDir = this.validateBackupDirectory(targetDir)
      if (!fs.existsSync(safeTargetDir)) {
        fs.mkdirSync(safeTargetDir, { recursive: true })
      }

      const now = new Date()
      const formatNum = (n: number): string => n.toString().padStart(2, '0')
      const timestamp = `${now.getFullYear()}${formatNum(now.getMonth() + 1)}${formatNum(now.getDate())}_${formatNum(now.getHours())}${formatNum(now.getMinutes())}${formatNum(now.getSeconds())}`
      
      const fileName = `AutoBackup_${timestamp}.svbackup`
      const filePath = path.join(safeTargetDir, fileName)

      await this.createFullBackup(filePath)
      
      return true
    } catch (e) {
      console.error('Auto backup failed:', e)
      return false
    }
  }

  public async cleanOldBackups(targetDir: string, maxBackups: number): Promise<void> {
    const safeTargetDir = assertSafeAbsoluteDirectory(targetDir)
    if (!fs.existsSync(safeTargetDir) || maxBackups <= 0) return

    try {
      const files = fs.readdirSync(safeTargetDir)
      
      const backupFiles = files
        .filter(f => /^AutoBackup_\d{8}_\d{6}\.(svbackup|svdata)$/.test(f))
        .map(f => {
          const fullPath = path.join(safeTargetDir, f)
          try {
            return {
              name: f,
              path: fullPath,
              time: fs.statSync(fullPath).birthtime.getTime()
            }
          } catch {
            return null
          }
        })
        .filter(f => f !== null) as { name: string, path: string, time: number }[]

      backupFiles.sort((a, b) => b.time - a.time)

      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(maxBackups)
        
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path)
        }
        
        console.log(`Cleaned ${filesToDelete.length} old backups`)
      }

    } catch (e) {
      console.error('Clean old backups failed:', e)
    }
  }

  public async createFullBackup(
    filePath: string
  ): Promise<{ success: true; type: 'full-application-backup' }> {
    const resolvedFilePath = path.resolve(filePath)
    if (path.extname(resolvedFilePath).toLowerCase() !== '.svbackup') {
      throw new Error('INVALID_FULL_BACKUP_EXTENSION')
    }
    const safeTargetDir = this.validateBackupDirectory(path.dirname(resolvedFilePath))
    const safeFilePath = path.join(safeTargetDir, path.basename(resolvedFilePath))
    const backupStage = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault_full_backup_'))
    const databaseSnapshot = path.join(backupStage, 'inventory.db')

    try {
      fs.mkdirSync(safeTargetDir, { recursive: true })
      await this.databaseManager.getDb().backup(databaseSnapshot)

      const zip = new AdmZip()
      const manifest: FullBackupManifest = {
        format: FULL_BACKUP_FORMAT,
        kind: 'full-application-backup',
        version: FULL_BACKUP_VERSION,
        createdAt: Date.now(),
        database: 'database/inventory.db',
        assetsRoot: 'assets/'
      }
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
      zip.addLocalFile(databaseSnapshot, 'database')

      const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
      this.addDirectoryFilesToZip(zip, assetsRoot, 'assets')
      this.writeZipAtomically(zip, safeFilePath)

      this.databaseManager.addLog({
        op_type: 'EXPORT',
        target_type: 'SYSTEM',
        target_id: 0,
        event_code: 'FULL_BACKUP_CREATE',
        summary_key: 'log.backup.fullBackup',
        summary_params: JSON.stringify({ file: path.basename(safeFilePath) }),
        undoable: 0
      })
      return { success: true, type: 'full-application-backup' as const }
    } finally {
      fs.rmSync(backupStage, { recursive: true, force: true })
    }
  }

  public async exportBundle(
    filePath: string,
    options: ExportBundleOptions
  ): Promise<ExportBundleResult> {
    try {
      const zip = new AdmZip()
      const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
      const db = this.databaseManager.getDb()
      
      let inventoryList: BundleInventoryItem[] = []
      let projectList: BundleProject[] = []
      let projectItemsList: ProjectItemLink[] = []

      if (options.type === 'all') {
        inventoryList = this.databaseManager.getAllInventoryForExport()
        const allProjs = this.databaseManager.getAllProjectsForExport()
        projectList = allProjs.map(p => {
          const { id, name, description, created_at, order_index, files } = p
          return { id, name, description, created_at, order_index, files }
        })
        projectItemsList = db.prepare('SELECT * FROM project_items').all() as ProjectItemLink[]
      } else {
        const targetInventoryIds = new Set(options.inventoryIds || [])
        
        if (options.projectIds && options.projectIds.length > 0) {
          for (const pid of options.projectIds) {
            if (!Number.isInteger(pid) || pid <= 0) throw new Error('INVALID_EXPORT_SELECTION')
            const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid) as BundleProject | undefined
            if (proj) projectList.push(proj)

            const items = db.prepare(
              'SELECT * FROM project_items WHERE project_id = ?'
            ).all(pid) as ProjectItemLink[]
            projectItemsList.push(...items)

            items.forEach(item => targetInventoryIds.add(item.inventory_id))
          }
        }

        if (targetInventoryIds.size > 0) {
          const ids = Array.from(targetInventoryIds)
          if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
            throw new Error('INVALID_EXPORT_SELECTION')
          }
          const placeholders = ids.map(() => '?').join(',')
          inventoryList = db.prepare(`SELECT * FROM inventory WHERE id IN (${placeholders})`)
            .all(...ids) as BundleInventoryItem[]
        }
      }

      const packedFiles = new Set<string>()

      const addFileToZip = (rawPaths?: string): void => {
        if (!rawPaths) return
        try {
          const paths = JSON.parse(rawPaths)
          if (Array.isArray(paths)) {
            for (const relativePath of paths) {
              const normalizedPath = normalizeRelativePath(relativePath)
              if (packedFiles.has(normalizedPath)) continue

              try {
                const fullPath = resolveExistingFileWithin(assetsRoot, normalizedPath)
                const zipPath = path.posix.join('assets', path.posix.dirname(normalizedPath))
                zip.addLocalFile(fullPath, zipPath)
                packedFiles.add(normalizedPath)
              } catch {
                console.warn(`Skipping missing or unsafe asset during export: ${normalizedPath}`)
              }
            }
          }
        } catch (e) {
          console.warn('Skipping invalid asset path list during export', e)
        }
      }

      inventoryList.forEach(item => {
        addFileToZip(item.image_paths)
        addFileToZip(item.datasheet_paths)
      })

      projectList.forEach(proj => {
        addFileToZip(proj.files)
      })

      const meta: BusinessBundleMeta = {
        format: BUSINESS_BUNDLE_FORMAT,
        kind: 'business-bundle',
        version: BUSINESS_BUNDLE_VERSION,
        createdAt: Date.now(),
        inventory: inventoryList,
        projects: projectList,
        projectItems: projectItemsList
      }

      zip.addFile("meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf8"))
      this.writeZipAtomically(zip, filePath)

      try {
        const csvContent = this.generateCsv(inventoryList)
        const csvPath = filePath.replace(/\.(svdata|zip)$/i, '') + '.csv'
        fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
      } catch (e) {
        console.error('CSV generation failed', e)
      }

      this.databaseManager.addLog({
        op_type: 'EXPORT',
        target_type: 'SYSTEM',
        target_id: 0,
        event_code: 'BUNDLE_EXPORT',
        summary_key: 'log.backup.export',
        summary_params: JSON.stringify({
          file: path.basename(filePath),
          inv: inventoryList.length,
          proj: projectList.length
        }),
        undoable: 0
      })

      return { 
        success: true, 
        count: { inventory: inventoryList.length, projects: projectList.length, files: packedFiles.size } 
      }

    } catch (e) {
      console.error('Export failed:', e)
      throw e
    }
  }

  public async scanBundle(filePath: string): Promise<BundleScanResult> {
    this.cleanupExpiredImportDirectories()
    const scanId = randomUUID()
    const importTempRoot = path.join(os.tmpdir(), 'siliconvault_import')
    fs.mkdirSync(importTempRoot, { recursive: true })
    const extractDir = path.join(importTempRoot, scanId)
    const db = this.databaseManager.getDb()
    const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')

    try {
      const sourceStat = fs.statSync(filePath)
      if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > MAX_BUNDLE_SIZE) {
        throw new Error('INVALID_BUNDLE_SIZE')
      }
      fs.mkdirSync(extractDir, { recursive: true })

      const fileBuffer = fs.readFileSync(filePath)
      const zip = new AdmZip(fileBuffer)
      this.extractBundleSafely(zip, extractDir)

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

      const metaPath = path.join(workingDir, 'meta.json')
      if (!fs.existsSync(metaPath)) throw new Error('Invalid bundle: missing meta.json')
      
      const meta = this.readBusinessBundleMeta(metaPath)
      this.tempSessions.set(scanId, {
        extractRoot: extractDir,
        workingDir,
        createdAt: Date.now()
      })

      const checkFilesDiff = (localJson?: string, remoteJson?: string): boolean => {
        try {
          const localPaths = JSON.parse(localJson || '[]')
          const remotePaths = JSON.parse(remoteJson || '[]')
          
          if (!Array.isArray(localPaths) || !Array.isArray(remotePaths)) return false
          
          if (localPaths.length !== remotePaths.length) return true
          
          const localHashes = new Set<string>()
          for (const lp of localPaths) {
             try {
               const lpFull = resolveExistingFileWithin(assetsRoot, lp)
               localHashes.add(this.calculateFileHash(lpFull))
             } catch {
               localHashes.add('')
             }
          }

          for (const rp of remotePaths) {
            const normalizedRelPath = normalizeRelativePath(rp)
            const fileNameOnly = path.basename(normalizedRelPath)
            const bundleAssetsRoot = path.join(workingDir, 'assets')
            let srcFile: string
            try {
              srcFile = resolveExistingFileWithin(bundleAssetsRoot, normalizedRelPath)
            } catch {
              srcFile = resolveExistingFileWithin(bundleAssetsRoot, fileNameOnly)
            }
            
            const remoteHash = this.calculateFileHash(srcFile)
            
            if (remoteHash && !localHashes.has(remoteHash)) return true
          }
          
          return false
        } catch {
          return false
        }
      }

      const conflictInventory: BundleScanResult['conflicts']['inventory'] = []
      let newInventoryCount = 0

      for (const remoteItem of meta.inventory) {
        const local = db.prepare(`
          SELECT * FROM inventory 
          WHERE name = ? AND package = ? AND value = ?
        `).get(
          remoteItem.name,
          remoteItem.package,
          remoteItem.value
        ) as BundleInventoryItem | undefined

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

      const conflictProjects: BundleScanResult['conflicts']['projects'] = []
      let newProjectCount = 0

      for (const remoteProj of meta.projects) {
        const local = db.prepare(`
          SELECT * FROM projects WHERE name = ?
        `).get(remoteProj.name) as BundleProject | undefined

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
      const message = e instanceof Error ? e.message : String(e)
      if (!/^(INVALID_|UNSUPPORTED_|BUNDLE_)/.test(message)) {
        console.error('Scan failed:', e)
      }
      this.cleanupTemp(scanId)
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
      throw e
    }
  }

  public async executeImport(
    scanId: string,
    strategies: ImportStrategies
  ): Promise<{ success: true }> {
    const session = this.tempSessions.get(scanId)
    if (
      !session ||
      Date.now() - session.createdAt > TEMP_SESSION_MAX_AGE_MS ||
      !fs.existsSync(session.workingDir)
    ) {
      this.cleanupTemp(scanId)
      throw new Error('Session expired')
    }
    const workingDir = session.workingDir

    const db = this.databaseManager.getDb()
    const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
    fs.mkdirSync(assetsRoot, { recursive: true })
    const stagingRoot = path.join(this.databaseManager.getStoragePath(), '.staging', 'imports', scanId)
    const stagingAssetsRoot = path.join(stagingRoot, 'assets')
    fs.mkdirSync(stagingAssetsRoot, { recursive: true })
    
    const inventoryIdMap = new Map<number, number>()
    const projectIdMap = new Map<number, number>()
    const stagedFiles = new Map<string, { stagedPath: string; finalPath: string; relativePath: string }>()
    const committedFiles: string[] = []

    try {
      this.validateImportStrategies(strategies)
      const meta = this.readBusinessBundleMeta(path.join(workingDir, 'meta.json'))

      const stageImportFiles = (rawPaths?: string): string => {
        if (!rawPaths) return JSON.stringify([])
        const paths = JSON.parse(rawPaths)
        if (!Array.isArray(paths)) throw new Error('INVALID_BUNDLE_ASSET_LIST')

        const newPaths: string[] = []
        const bundleAssetsRoot = path.join(workingDir, 'assets')
        for (const relPath of paths) {
          const normalizedRelPath = normalizeRelativePath(relPath)
          const fileNameOnly = path.basename(normalizedRelPath)
          let srcFile: string
          try {
            srcFile = resolveExistingFileWithin(bundleAssetsRoot, normalizedRelPath)
          } catch {
            try {
              srcFile = resolveExistingFileWithin(bundleAssetsRoot, fileNameOnly)
            } catch {
              console.warn(`Skipping missing bundle attachment: ${normalizedRelPath}`)
              continue
            }
          }

          const existingStage = stagedFiles.get(srcFile)
          if (existingStage) {
            newPaths.push(existingStage.relativePath)
            continue
          }

          const safeFileName = sanitizePathSegment(fileNameOnly, 'attachment')
          const finalRelativePath = normalizeRelativePath(
            `imports/${scanId.slice(0, 8)}/${randomUUID()}_${safeFileName}`
          )
          const stagedPath = resolvePathWithin(stagingAssetsRoot, finalRelativePath)
          const finalPath = resolvePathWithin(assetsRoot, finalRelativePath)
          fs.mkdirSync(path.dirname(stagedPath), { recursive: true })
          fs.copyFileSync(srcFile, stagedPath, fs.constants.COPYFILE_EXCL)
          stagedFiles.set(srcFile, {
            stagedPath,
            finalPath,
            relativePath: finalRelativePath
          })
          newPaths.push(finalRelativePath)
        }
        return JSON.stringify(newPaths)
      }

      const commitStagedFiles = (): void => {
        for (const file of stagedFiles.values()) {
          fs.mkdirSync(path.dirname(file.finalPath), { recursive: true })
          fs.renameSync(file.stagedPath, file.finalPath)
          committedFiles.push(file.finalPath)
        }
      }

      const transaction = db.transaction(() => {
        
        for (const item of meta.inventory) {
          const strategy = strategies.inventory[item.id] || 'keep_both'
          
            const existing = db.prepare(
              'SELECT id FROM inventory WHERE name = ? AND package = ? AND value = ?'
            ).get(item.name, item.package, item.value) as { id: number } | undefined

          if (existing && strategy === 'skip') {
            inventoryIdMap.set(item.id, existing.id)
            continue
          }

          const newImages = stageImportFiles(item.image_paths)
          const newDatasheets = stageImportFiles(item.datasheet_paths)

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
          const existing = db.prepare(
            'SELECT id FROM projects WHERE name = ?'
          ).get(proj.name) as { id: number } | undefined

          if (existing && strategy === 'skip') {
            projectIdMap.set(proj.id, existing.id)
            continue
          }

          const newFiles = stageImportFiles(proj.files)

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

        commitStagedFiles()
      })

      transaction()

      const invCount = meta.inventory.length
      const projCount = meta.projects.length
      this.databaseManager.addLog({
        op_type: 'IMPORT',
        target_type: 'SYSTEM',
        target_id: 0,
        event_code: 'BUNDLE_IMPORT',
        summary_key: 'log.backup.import',
        summary_params: JSON.stringify({
          session: scanId.substring(0, 8),
          inv: invCount,
          proj: projCount
        }),
        undoable: 0
      })

      return { success: true }

    } catch (e) {
      console.error('Import execution failed:', e)
      for (const committedFile of committedFiles) {
        try {
          if (fs.existsSync(committedFile)) fs.rmSync(committedFile, { force: true })
        } catch (cleanupError) {
          console.error('Failed to roll back imported attachment', cleanupError)
        }
      }
      throw e
    } finally {
      fs.rmSync(stagingRoot, { recursive: true, force: true })
      this.cleanupTemp(scanId)
    }
  }

  public async generateTemplate(filePath: string): Promise<{ success: true }> {
    try {
      const zip = new AdmZip()
      
      const demoMeta: BusinessBundleMeta = {
        format: BUSINESS_BUNDLE_FORMAT,
        kind: 'business-bundle',
        version: BUSINESS_BUNDLE_VERSION,
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

      this.writeZipAtomically(zip, filePath)

      return { success: true }
    } catch (e) {
      console.error('Template generation failed:', e)
      throw e
    }
  }

  private validateBusinessBundleMeta(raw: unknown): BusinessBundleMeta {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('INVALID_BUNDLE_META')
    }
    const candidate = raw as Record<string, unknown>
    if (
      typeof candidate.version !== 'string' ||
      ![LEGACY_BUNDLE_VERSION, BUSINESS_BUNDLE_VERSION].includes(candidate.version)
    ) {
      throw new Error(`UNSUPPORTED_BUNDLE_VERSION:${String(candidate.version || 'missing')}`)
    }
    if (
      candidate.version === BUSINESS_BUNDLE_VERSION &&
      (candidate.format !== BUSINESS_BUNDLE_FORMAT || candidate.kind !== 'business-bundle')
    ) {
      throw new Error('INVALID_BUNDLE_FORMAT')
    }
    if (!Number.isFinite(candidate.createdAt)) throw new Error('INVALID_BUNDLE_CREATED_AT')
    if (
      !Array.isArray(candidate.inventory) ||
      !Array.isArray(candidate.projects) ||
      !Array.isArray(candidate.projectItems)
    ) {
      throw new Error('INVALID_BUNDLE_STRUCTURE')
    }
    if (
      candidate.inventory.length > 100_000 ||
      candidate.projects.length > 100_000 ||
      candidate.projectItems.length > 1_000_000
    ) {
      throw new Error('BUNDLE_RECORD_LIMIT_EXCEEDED')
    }
    const inventory = candidate.inventory as Array<Record<string, unknown>>
    const projects = candidate.projects as Array<Record<string, unknown>>
    const projectItems = candidate.projectItems as Array<Record<string, unknown>>

    const assertId = (value: unknown, field: string): void => {
      if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      }
    }
    const assertText = (value: unknown, field: string, allowEmpty = true): void => {
      if (typeof value !== 'string' || value.length > 10_000 || (!allowEmpty && !value.trim())) {
        throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      }
    }
    const assertNonNegativeInt = (value: unknown, field: string): void => {
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      }
    }
    const validatePathList = (value: unknown, field: string): void => {
      if (value === undefined || value === null || value === '') return
      if (typeof value !== 'string') throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      if (value.length > 1_000_000) throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      let paths: unknown
      try {
        paths = JSON.parse(value)
      } catch {
        throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      }
      if (!Array.isArray(paths) || paths.length > 200) throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
      for (const assetPath of paths) {
        if (typeof assetPath !== 'string' || assetPath.length > 1024) {
          throw new Error(`INVALID_BUNDLE_FIELD:${field}`)
        }
        normalizeRelativePath(assetPath)
      }
    }

    const inventoryIds = new Set<number>()
    for (const item of inventory) {
      assertId(item.id, 'inventory.id')
      const itemId = item.id as number
      if (inventoryIds.has(itemId)) throw new Error('DUPLICATE_BUNDLE_INVENTORY_ID')
      inventoryIds.add(itemId)
      assertText(item.category ?? '', 'inventory.category')
      assertText(item.name ?? '', 'inventory.name')
      assertText(item.value ?? '', 'inventory.value')
      assertText(item.package ?? '', 'inventory.package')
      assertText(item.location ?? '', 'inventory.location')
      if (!String(item.name || '').trim() && !String(item.value || '').trim()) {
        throw new Error('INVALID_BUNDLE_FIELD:inventory.name_or_value')
      }
      assertNonNegativeInt(item.quantity ?? 0, 'inventory.quantity')
      assertNonNegativeInt(item.min_stock ?? 10, 'inventory.min_stock')
      validatePathList(item.image_paths, 'inventory.image_paths')
      validatePathList(item.datasheet_paths, 'inventory.datasheet_paths')
    }

    const projectIds = new Set<number>()
    for (const project of projects) {
      assertId(project.id, 'projects.id')
      const projectId = project.id as number
      if (projectIds.has(projectId)) throw new Error('DUPLICATE_BUNDLE_PROJECT_ID')
      projectIds.add(projectId)
      assertText(project.name, 'projects.name', false)
      assertText(project.description ?? '', 'projects.description')
      validatePathList(project.files, 'projects.files')
    }

    const linkKeys = new Set<string>()
    for (const link of projectItems) {
      assertId(link.project_id, 'projectItems.project_id')
      assertId(link.inventory_id, 'projectItems.inventory_id')
      if (!Number.isSafeInteger(link.quantity) || (link.quantity as number) <= 0) {
        throw new Error('INVALID_BUNDLE_FIELD:projectItems.quantity')
      }
      const projectId = link.project_id as number
      const inventoryId = link.inventory_id as number
      if (!projectIds.has(projectId) || !inventoryIds.has(inventoryId)) {
        throw new Error('INVALID_BUNDLE_REFERENCE')
      }
      const key = `${projectId}:${inventoryId}`
      if (linkKeys.has(key)) throw new Error('DUPLICATE_BUNDLE_PROJECT_ITEM')
      linkKeys.add(key)
    }

    return raw as BusinessBundleMeta
  }

  private readBusinessBundleMeta(metaPath: string): BusinessBundleMeta {
    const stat = fs.statSync(metaPath)
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_META_SIZE) {
      throw new Error('INVALID_BUNDLE_META_SIZE')
    }

    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch {
      throw new Error('INVALID_BUNDLE_JSON')
    }
    return this.validateBusinessBundleMeta(raw)
  }

  private validateImportStrategies(strategies: ImportStrategies): void {
    if (!strategies || typeof strategies !== 'object') throw new Error('INVALID_IMPORT_STRATEGIES')
    const allowed = new Set(['skip', 'overwrite', 'keep_both'])
    for (const group of [strategies.inventory, strategies.projects]) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        throw new Error('INVALID_IMPORT_STRATEGIES')
      }
      for (const [id, strategy] of Object.entries(group)) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0 || !allowed.has(strategy)) {
          throw new Error('INVALID_IMPORT_STRATEGIES')
        }
      }
    }
  }

  private extractBundleSafely(zip: AdmZip, extractRoot: string): void {
    const entries = zip.getEntries()
    if (entries.length === 0 || entries.length > MAX_ENTRY_COUNT) {
      throw new Error('INVALID_BUNDLE_ENTRY_COUNT')
    }

    let totalSize = 0
    for (const entry of entries) {
      const rawName = entry.entryName.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!rawName) continue
      const normalized = normalizeRelativePath(rawName)
      const entrySize = Number(entry.header.size) || 0
      if (entrySize < 0 || entrySize > MAX_ENTRY_SIZE) throw new Error('BUNDLE_ENTRY_TOO_LARGE')
      totalSize += entrySize
      if (totalSize > MAX_BUNDLE_SIZE) throw new Error('BUNDLE_UNCOMPRESSED_SIZE_EXCEEDED')

      const destination = resolvePathWithin(extractRoot, normalized)
      if (entry.isDirectory) {
        fs.mkdirSync(destination, { recursive: true })
        continue
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true })
      const data = entry.getData()
      if (data.length !== entrySize) throw new Error('BUNDLE_ENTRY_SIZE_MISMATCH')
      fs.writeFileSync(destination, data, { flag: 'wx' })
    }
  }

  private addDirectoryFilesToZip(zip: AdmZip, sourceRoot: string, zipRoot: string): void {
    if (!fs.existsSync(sourceRoot)) return
    const traverse = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          traverse(absolutePath)
        } else if (entry.isFile()) {
          const relativePath = normalizeRelativePath(path.relative(sourceRoot, absolutePath))
          const zipDirectory = path.posix.join(zipRoot, path.posix.dirname(relativePath))
          zip.addLocalFile(resolveExistingFileWithin(sourceRoot, relativePath), zipDirectory)
        }
      }
    }
    traverse(sourceRoot)
  }

  private writeZipAtomically(zip: AdmZip, filePath: string): void {
    const destination = path.resolve(filePath)
    const destinationDir = path.dirname(destination)
    fs.mkdirSync(destinationDir, { recursive: true })
    const temporaryPath = path.join(
      destinationDir,
      `.${sanitizePathSegment(path.basename(destination), 'bundle')}.${randomUUID()}.tmp`
    )

    try {
      zip.writeZip(temporaryPath)
      this.replaceFileAtomically(temporaryPath, destination)
    } finally {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true })
    }
  }

  private replaceFileAtomically(sourcePath: string, destinationPath: string): void {
    let previousPath: string | null = null
    if (fs.existsSync(destinationPath)) {
      const destinationStat = fs.lstatSync(destinationPath)
      if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) {
        throw new Error('INVALID_BACKUP_TARGET')
      }
      previousPath = `${destinationPath}.${randomUUID()}.previous`
      fs.renameSync(destinationPath, previousPath)
    }

    try {
      fs.renameSync(sourcePath, destinationPath)
    } catch (error) {
      if (previousPath && fs.existsSync(previousPath) && !fs.existsSync(destinationPath)) {
        fs.renameSync(previousPath, destinationPath)
      }
      throw error
    }

    if (previousPath && fs.existsSync(previousPath)) {
      try {
        fs.rmSync(previousPath, { force: true })
      } catch (error) {
        console.warn('Failed to remove the replaced backup file', error)
      }
    }
  }

  public cleanupExpiredImportDirectories(maxAgeMs = TEMP_SESSION_MAX_AGE_MS): void {
    const roots = [
      path.join(os.tmpdir(), 'siliconvault_import'),
      path.join(this.databaseManager.getStoragePath(), '.staging', 'imports')
    ]
    const now = Date.now()

    for (const root of roots) {
      if (!fs.existsSync(root)) continue
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue
        try {
          const directory = resolvePathWithin(root, entry.name)
          const stat = fs.statSync(directory)
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.rmSync(directory, { recursive: true, force: true })
          }
        } catch (error) {
          console.warn('Failed to inspect stale import directory', error)
        }
      }
    }
  }

  private cleanupTemp(scanId: string): void {
    const session = this.tempSessions.get(scanId)
    if (session?.extractRoot && fs.existsSync(session.extractRoot)) {
      try {
        fs.rmSync(session.extractRoot, { recursive: true, force: true })
      } catch (e) { console.error('Cleanup temp failed', e) }
    }
    this.tempSessions.delete(scanId)
  }

  private generateCsv(items: InventoryItem[]): string {
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
