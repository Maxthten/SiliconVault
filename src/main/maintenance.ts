/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs'
import path from 'path'
import { dbManager, type DBManager } from './db'
import {
  normalizeRelativePath,
  resolveExistingFileWithin,
  toPortableRelativePath
} from './path-security'
import type {
  AssetScanResult,
  DatabaseOptimizationResult,
  MaintenanceDiagnostics,
  PurgeResult
} from '../shared/types'

interface AssetPathRow {
  image_paths?: string | null
  datasheet_paths?: string | null
  files?: string | null
}

interface AssetReferenceCollection {
  referenced: Set<string>
  invalidReferences: number
}

interface DatabaseDiagnostics {
  integrityCheck: string
  foreignKeyViolations: number
  orphanProjectItems: number
  databaseSize: number
  walSize: number
  pageCount: number
  pageSize: number
  freelistPages: number
  reclaimableBytes: number
}

export class MaintenanceManager {
  constructor(private readonly databaseManager: DBManager = dbManager) {}

  private collectReferencedAssets(): AssetReferenceCollection {
    const db = this.databaseManager.getDb()
    const referenced = new Set<string>()
    let invalidReferences = 0

    const collectPaths = (jsonValue?: string | null): void => {
      if (!jsonValue) return
      let paths: unknown
      try {
        paths = JSON.parse(jsonValue)
      } catch {
        invalidReferences++
        return
      }
      if (!Array.isArray(paths)) {
        invalidReferences++
        return
      }
      for (const assetPath of paths) {
        try {
          referenced.add(normalizeRelativePath(assetPath))
        } catch {
          invalidReferences++
        }
      }
    }

    const inventoryItems = db.prepare(
      'SELECT image_paths, datasheet_paths FROM inventory'
    ).all() as AssetPathRow[]
    for (const item of inventoryItems) {
      collectPaths(item.image_paths)
      collectPaths(item.datasheet_paths)
    }

    const projects = db.prepare('SELECT files FROM projects').all() as AssetPathRow[]
    for (const project of projects) collectPaths(project.files)
    return { referenced, invalidReferences }
  }

  public scanUnusedAssets(): AssetScanResult {
    const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
    const emptyResult: AssetScanResult = {
      totalSize: 0,
      count: 0,
      items: [],
      scannedFiles: 0,
      referencedFiles: 0,
      missingReferencedFiles: [],
      invalidReferences: 0,
      skippedEntries: 0
    }
    if (!fs.existsSync(assetsRoot)) return emptyResult

    const { referenced, invalidReferences } = this.collectReferencedAssets()
    const unusedItems: AssetScanResult['items'] = []
    let totalSize = 0
    let scannedFiles = 0
    let skippedEntries = 0

    const traverse = (currentPath: string): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true })
      } catch (error) {
        skippedEntries++
        console.warn(`无法访问目录 ${currentPath}:`, error)
        return
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)
        try {
          if (entry.isSymbolicLink()) {
            skippedEntries++
            continue
          }
          if (entry.isDirectory()) {
            traverse(fullPath)
            continue
          }
          if (!entry.isFile() || entry.name === '.DS_Store' || entry.name === 'Thumbs.db') {
            continue
          }

          scannedFiles++
          const relativePath = toPortableRelativePath(assetsRoot, fullPath)
          if (!referenced.has(relativePath)) {
            const stats = fs.statSync(fullPath)
            unusedItems.push({
              name: entry.name,
              relativePath,
              size: stats.size,
              mtime: stats.mtime.getTime()
            })
            totalSize += stats.size
          }
        } catch (error) {
          skippedEntries++
          console.warn(`跳过资源 ${entry.name}:`, error)
        }
      }
    }

    traverse(assetsRoot)

    const missingReferencedFiles = Array.from(referenced)
      .filter((relativePath) => {
        try {
          resolveExistingFileWithin(assetsRoot, relativePath)
          return false
        } catch {
          return true
        }
      })
      .sort()

    return {
      totalSize,
      count: unusedItems.length,
      items: unusedItems.sort((left, right) => right.size - left.size),
      scannedFiles,
      referencedFiles: referenced.size,
      missingReferencedFiles,
      invalidReferences,
      skippedEntries
    }
  }

  public purgeAssets(files: string[]): PurgeResult {
    const assetsRoot = path.join(this.databaseManager.getStoragePath(), 'assets')
    if (!Array.isArray(files) || files.length > 10_000) {
      throw new Error('INVALID_PURGE_REQUEST')
    }
    if (!fs.existsSync(assetsRoot)) {
      return {
        successCount: 0,
        failCount: files.length,
        skippedReferenced: 0,
        freedSpace: 0,
        removedDirectories: 0
      }
    }

    const { referenced } = this.collectReferencedAssets()
    const uniqueFiles = Array.from(new Set(files))
    let successCount = 0
    let failCount = files.length - uniqueFiles.length
    let skippedReferenced = 0
    let freedSpace = 0

    for (const relativePath of uniqueFiles) {
      try {
        const normalized = normalizeRelativePath(relativePath)
        if (referenced.has(normalized)) {
          skippedReferenced++
          failCount++
          continue
        }
        const fullPath = resolveExistingFileWithin(assetsRoot, normalized)
        const stat = fs.statSync(fullPath)
        fs.unlinkSync(fullPath)
        successCount++
        freedSpace += stat.size
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('INVALID_PATH:')) {
          console.error(`删除文件失败: ${relativePath}`, error)
        }
        failCount++
      }
    }

    return {
      successCount,
      failCount,
      skippedReferenced,
      freedSpace,
      removedDirectories: this.removeEmptyAssetDirectories(assetsRoot)
    }
  }

  public getMaintenanceDiagnostics(): MaintenanceDiagnostics {
    return {
      ...this.getDatabaseDiagnostics(),
      assetScan: this.scanUnusedAssets()
    }
  }

  public optimizeDatabase(): DatabaseOptimizationResult {
    const db = this.databaseManager.getDb()
    const before = this.getDatabaseDiagnostics()
    const removeOrphans = db.transaction(() => db.prepare(`
      DELETE FROM project_items
      WHERE project_id NOT IN (SELECT id FROM projects)
         OR inventory_id NOT IN (SELECT id FROM inventory)
    `).run().changes)
    const orphansRemoved = removeOrphans()

    db.pragma('optimize')

    let checkpointed = false
    try {
      const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>
      checkpointed = Number(checkpoint[0]?.busy || 0) === 0
    } catch (error) {
      console.warn('WAL checkpoint skipped:', error)
    }

    let vacuumed = false
    try {
      db.exec('VACUUM')
      vacuumed = true
    } catch (error) {
      const sqliteError = error as { code?: string; message?: string }
      if (sqliteError.code !== 'SQLITE_BUSY' && sqliteError.code !== 'SQLITE_LOCKED') throw error
      console.warn('VACUUM skipped:', sqliteError.message)
    }

    const after = this.getDatabaseDiagnostics()
    const sizeBefore = before.databaseSize + before.walSize
    const sizeAfter = after.databaseSize + after.walSize
    return {
      integrityCheck: after.integrityCheck,
      foreignKeyViolations: after.foreignKeyViolations,
      orphansRemoved,
      vacuumed,
      checkpointed,
      databaseSizeBefore: sizeBefore,
      databaseSizeAfter: sizeAfter,
      reclaimedBytes: Math.max(0, sizeBefore - sizeAfter)
    }
  }

  private getDatabaseDiagnostics(): DatabaseDiagnostics {
    const db = this.databaseManager.getDb()
    const storagePath = this.databaseManager.getStoragePath()
    const databasePath = path.join(storagePath, 'inventory.db')
    const walPath = `${databasePath}-wal`
    const integrityRows = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    const integrityCheck = integrityRows.map((row) => row.integrity_check).join(', ') || 'unknown'
    const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length
    const orphanProjectItems = Number((db.prepare(`
      SELECT COUNT(*) AS count
      FROM project_items pi
      LEFT JOIN projects p ON p.id = pi.project_id
      LEFT JOIN inventory i ON i.id = pi.inventory_id
      WHERE p.id IS NULL OR i.id IS NULL
    `).get() as { count: number }).count)
    const pageCount = Number(db.pragma('page_count', { simple: true })) || 0
    const pageSize = Number(db.pragma('page_size', { simple: true })) || 0
    const freelistPages = Number(db.pragma('freelist_count', { simple: true })) || 0

    return {
      integrityCheck,
      foreignKeyViolations,
      orphanProjectItems,
      databaseSize: this.getFileSize(databasePath),
      walSize: this.getFileSize(walPath),
      pageCount,
      pageSize,
      freelistPages,
      reclaimableBytes: freelistPages * pageSize
    }
  }

  private getFileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size
    } catch {
      return 0
    }
  }

  private removeEmptyAssetDirectories(assetsRoot: string): number {
    let removed = 0
    const visit = (directory: string): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          visit(path.join(directory, entry.name))
        }
      }
      if (directory === assetsRoot) return
      try {
        if (fs.readdirSync(directory).length === 0) {
          fs.rmdirSync(directory)
          removed++
        }
      } catch {
        // A concurrent writer or permission restriction can leave the directory in place safely.
      }
    }
    visit(assetsRoot)
    return removed
  }
}

export const maintenanceManager = new MaintenanceManager()
