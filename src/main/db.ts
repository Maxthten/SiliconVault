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

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import Store from 'electron-store'
import {
  ensureDevelopmentStoragePath,
  isDevelopmentStorageMode
} from './environment'
import { normalizeFilesystemPath } from './path-security'
import type {
  AppSettings,
  BomItem,
  BomProject,
  CategoryRule,
  DeductionContext,
  DeductionItem,
  FilterOptions,
  ImportStrategy,
  InventoryHealthStats,
  InventoryImportItem,
  InventoryItem,
  NewOperationLog,
  OperationEventCode,
  OperationLog,
  QuantityUpdate,
  StoredInventoryItem
} from '../shared/types'
export type {
  AppSettings,
  BomItem,
  BomProject,
  CategoryRule,
  DeductionContext,
  FilterOptions,
  ImportStrategy,
  InventoryHealthStats,
  InventoryItem,
  OperationEventCode,
  OperationLog,
  QuantityUpdate
} from '../shared/types'

interface StockLogDetail {
  inventory_id: number
  name: string
  value: string
  category: string
  package: string
  before: number
  after: number
  delta: number
}

// 更改为英文默认值，适应国际化新用户
const DEFAULT_CATEGORIES = [
  "Resistor", "Capacitor", "Inductor", "Diode", "Transistor", 
  "IC", "Connector", "Module", "Switch", "Other"
]

const SYSTEM_DEFAULTS: Record<string, CategoryRule> = {
  // --- 保留中文键 (兼容老用户数据) ---
  '电阻': { 
    nameLabel: '精度/功率', namePlaceholder: '选填 (如 1%)', 
    valueLabel: '阻值', valuePlaceholder: '必填 (如 10k)', 
    packageLabel: '封装',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  '电容': { 
    nameLabel: '耐压/材质', namePlaceholder: '选填 (如 50V)', 
    valueLabel: '容值', valuePlaceholder: '必填 (如 100nF)', 
    packageLabel: '封装',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  '电感': { 
    nameLabel: '电流/参数', namePlaceholder: '选填 (如 1A)', 
    valueLabel: '感值', valuePlaceholder: '必填 (如 10uH)', 
    packageLabel: '封装',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  '芯片(IC)': { 
    nameLabel: '完整型号', namePlaceholder: '必填 (如 STM32F103)', 
    valueLabel: '核心描述', valuePlaceholder: '选填 (如 MCU)', 
    packageLabel: '封装',
    layout: { topLeft: 'name', topRight: 'package', bottomLeft: 'value', bottomRight: 'location' }
  },
  // --- 新增英文键 (适配新用户) ---
  'Resistor': { 
    nameLabel: 'Tolerance/Power', namePlaceholder: 'Optional (e.g. 1%)', 
    valueLabel: 'Resistance', valuePlaceholder: 'Required (e.g. 10k)', 
    packageLabel: 'Package',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  'Capacitor': { 
    nameLabel: 'Voltage/Material', namePlaceholder: 'Optional (e.g. 50V)', 
    valueLabel: 'Capacitance', valuePlaceholder: 'Required (e.g. 100nF)', 
    packageLabel: 'Package',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  'Inductor': { 
    nameLabel: 'Current/Param', namePlaceholder: 'Optional (e.g. 1A)', 
    valueLabel: 'Inductance', valuePlaceholder: 'Required (e.g. 10uH)', 
    packageLabel: 'Package',
    layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
  },
  'IC': { 
    nameLabel: 'Full Part No.', namePlaceholder: 'Required (e.g. STM32)', 
    valueLabel: 'Description', valuePlaceholder: 'Optional (e.g. MCU)', 
    packageLabel: 'Package',
    layout: { topLeft: 'name', topRight: 'package', bottomLeft: 'value', bottomRight: 'location' }
  }
}

const GENERIC_RULE: CategoryRule = {
  nameLabel: 'Name/Model', namePlaceholder: 'Required',
  valueLabel: 'Value/Param', valuePlaceholder: 'Optional',
  packageLabel: 'Package',
  layout: { topLeft: 'value', topRight: 'package', bottomLeft: 'name', bottomRight: 'location' }
}

export class DBManager {
  private db: Database.Database
  private userDataPath: string
  private categoryRulesCache: Record<string, CategoryRule> | null = null

  constructor(storagePathOverride?: string) {
    if (storagePathOverride) {
      this.userDataPath = normalizeFilesystemPath(storagePathOverride)
    } else if (isDevelopmentStorageMode()) {
      this.userDataPath = ensureDevelopmentStoragePath()
    } else {
      const store = new Store()
      const defaultPath = path.join(app.getPath('documents'), 'SiliconVault')
      this.userDataPath = normalizeFilesystemPath((store.get('storagePath') as string) || defaultPath)
    }

    if (!fs.existsSync(this.userDataPath)) {
      try {
        fs.mkdirSync(this.userDataPath, { recursive: true })
      } catch (e) {
        if (isDevelopmentStorageMode()) {
          throw new Error(`Failed to create isolated development storage: ${this.userDataPath}`)
        }
        console.error('创建数据目录失败，回退到临时目录', e)
        this.userDataPath = app.getPath('userData')
      }
    }

    this.userDataPath = normalizeFilesystemPath(this.userDataPath)
    const dbPath = normalizeFilesystemPath(path.join(this.userDataPath, 'inventory.db'))
    this.db = new Database(dbPath)
    this.db.pragma('foreign_keys = ON')

    this.initTable()
    this.migrateSchema()
    this.cleanupOrphanProjectItems()
  }

  public getDb(): Database.Database {
    return this.db
  }

  public getStoragePath(): string {
    return this.userDataPath
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, 
        name TEXT, 
        value TEXT, 
        package TEXT, 
        quantity INTEGER, 
        location TEXT, 
        min_stock INTEGER DEFAULT 10,
        image_paths TEXT,    
        datasheet_paths TEXT 
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, 
        description TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        order_index INTEGER DEFAULT 0,
        files TEXT
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_items (
        project_id INTEGER, inventory_id INTEGER, quantity INTEGER,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(inventory_id) REFERENCES inventory(id)
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS category_rules (
        category TEXT PRIMARY KEY, rule_json TEXT
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op_type TEXT, 
        target_type TEXT, 
        target_id INTEGER, 
        event_code TEXT,
        summary_key TEXT,
        summary_params TEXT,
        details TEXT,
        undoable INTEGER DEFAULT 0,
        undone_at DATETIME,
        desc TEXT, 
        old_data TEXT, 
        new_data TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sort_orders (
        table_name TEXT PRIMARY KEY,
        id_order TEXT 
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)
  }

  private migrateSchema() {
    try {
      const invColumns = this.db.prepare("PRAGMA table_info(inventory)").all() as any[]
      const invColumnNames = invColumns.map(c => c.name)

      if (!invColumnNames.includes('image_paths')) {
        this.db.prepare("ALTER TABLE inventory ADD COLUMN image_paths TEXT").run()
      }
      if (!invColumnNames.includes('datasheet_paths')) {
        this.db.prepare("ALTER TABLE inventory ADD COLUMN datasheet_paths TEXT").run()
      }

      const projColumns = this.db.prepare("PRAGMA table_info(projects)").all() as any[]
      const projColumnNames = projColumns.map(c => c.name)

      if (!projColumnNames.includes('files')) {
        this.db.prepare("ALTER TABLE projects ADD COLUMN files TEXT").run()
      }

      const logColumns = this.db.prepare("PRAGMA table_info(operation_logs)").all() as any[]
      const logColumnNames = logColumns.map(c => c.name)
      const logMigrations = [
        ['event_code', 'TEXT'],
        ['summary_key', 'TEXT'],
        ['summary_params', 'TEXT'],
        ['details', 'TEXT'],
        ['undoable', 'INTEGER DEFAULT 0'],
        ['undone_at', 'DATETIME']
      ] as const

      for (const [name, definition] of logMigrations) {
        if (!logColumnNames.includes(name)) {
          this.db.prepare(`ALTER TABLE operation_logs ADD COLUMN ${name} ${definition}`).run()
        }
      }

      this.migrateLegacyOperationLogs()
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_operation_logs_event_time
        ON operation_logs(event_code, created_at);
        CREATE INDEX IF NOT EXISTS idx_operation_logs_undo_state
        ON operation_logs(undoable, undone_at);
      `)

    } catch (e) {
      console.error('数据库结构迁移失败', e)
    }
  }

  private migrateLegacyOperationLogs() {
    const rows = this.db.prepare(`
      SELECT * FROM operation_logs
      WHERE event_code IS NULL OR event_code = ''
    `).all() as OperationLog[]
    if (rows.length === 0) return

    const update = this.db.prepare(`
      UPDATE operation_logs
      SET event_code = ?, summary_key = ?, summary_params = ?, undoable = ?
      WHERE id = ?
    `)

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        let summaryKey = ''
        let summaryParams = '{}'
        try {
          const parsed = row.desc ? JSON.parse(row.desc) : null
          if (parsed?.key) {
            summaryKey = parsed.key
            summaryParams = JSON.stringify(parsed.params || {})
          }
        } catch {
          summaryKey = ''
        }

        let eventCode: OperationEventCode = 'LEGACY'
        if (summaryKey === 'log.inventory.deduct' || row.desc?.includes('生产扣减')) {
          eventCode = 'BOM_PRODUCTION_DEDUCTION'
        } else if (summaryKey === 'log.inventory.stock' || row.op_type === 'STOCK') {
          const delta = this.getSnapshotQuantityDelta(row)
          eventCode = delta >= 0 ? 'INVENTORY_MANUAL_IN' : 'INVENTORY_MANUAL_OUT'
        } else if (summaryKey === 'log.inventory.create') eventCode = 'INVENTORY_CREATE'
        else if (summaryKey === 'log.inventory.update') eventCode = 'INVENTORY_UPDATE'
        else if (summaryKey === 'log.inventory.delete') eventCode = 'INVENTORY_DELETE'
        else if (summaryKey === 'log.project.create') eventCode = 'PROJECT_CREATE'
        else if (summaryKey === 'log.project.update') eventCode = 'PROJECT_UPDATE'
        else if (summaryKey === 'log.project.delete') eventCode = 'PROJECT_DELETE'
        else if (summaryKey === 'log.backup.import' || row.op_type === 'IMPORT') eventCode = 'BUNDLE_IMPORT'
        else if (summaryKey === 'log.backup.export' || row.op_type === 'EXPORT') eventCode = 'BUNDLE_EXPORT'

        const undoable = ['CREATE', 'UPDATE', 'DELETE', 'STOCK'].includes(row.op_type) ? 1 : 0
        update.run(eventCode, summaryKey || null, summaryParams, undoable, row.id)
      }
    })
    tx()
  }

  public addLog(log: NewOperationLog): number {
    const safeLog = {
      op_type: log.op_type,
      target_type: log.target_type,
      target_id: log.target_id,
      event_code: log.event_code || 'LEGACY',
      summary_key: log.summary_key || null,
      summary_params: log.summary_params || null,
      details: log.details || null,
      undoable: log.undoable ? 1 : 0,
      desc: log.desc || null,
      old_data: log.old_data || null, 
      new_data: log.new_data || null,
    }

    const info = this.db.prepare(`
      INSERT INTO operation_logs (
        op_type, target_type, target_id, event_code, summary_key, summary_params,
        details, undoable, desc, old_data, new_data
      )
      VALUES (
        @op_type, @target_type, @target_id, @event_code, @summary_key, @summary_params,
        @details, @undoable, @desc, @old_data, @new_data
      )
    `).run(safeLog)

    this.db.exec(`DELETE FROM operation_logs WHERE id NOT IN (SELECT id FROM operation_logs ORDER BY id DESC LIMIT 1000)`)
    return Number(info.lastInsertRowid)
  }

  public getLogs(): OperationLog[] {
    return this.db.prepare("SELECT * FROM operation_logs ORDER BY id DESC").all() as OperationLog[]
  }

  public undoOperation(logId: number) {
    this.assertPositiveInteger(logId, 'logId')
    const log = this.db.prepare("SELECT * FROM operation_logs WHERE id = ?").get(logId) as OperationLog
    if (!log) throw new Error('日志不存在')
    if (!log.undoable) throw new Error('UNDO_NOT_SUPPORTED')
    if (log.undone_at) throw new Error('ALREADY_UNDONE')

    const undoTx = this.db.transaction(() => {
      switch (log.event_code) {
        case 'INVENTORY_MANUAL_IN':
        case 'INVENTORY_MANUAL_OUT':
        case 'INVENTORY_BATCH_ADJUST':
        case 'BOM_PRODUCTION_DEDUCTION':
          this.undoStockLog(log)
          break
        case 'CSV_IMPORT':
          this.undoCsvImport(log)
          break
        case 'INVENTORY_CREATE':
          this.undoInventoryCreate(log)
          break
        case 'INVENTORY_DELETE':
          this.restoreDeletedInventory(log)
          break
        case 'INVENTORY_UPDATE':
          this.restoreUpdatedInventory(log)
          break
        case 'PROJECT_CREATE':
          this.undoProjectCreate(log)
          break
        case 'PROJECT_DELETE':
          this.restoreDeletedProject(log)
          break
        case 'PROJECT_UPDATE':
          this.restoreUpdatedProject(log)
          break
        default:
          this.undoLegacyLog(log)
      }

      this.db.prepare("UPDATE operation_logs SET undone_at = CURRENT_TIMESTAMP WHERE id = ?").run(logId)
    })

    undoTx()
  }

  private parseLogJson<T>(value?: string | null): T | null {
    if (!value) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }

  private getSnapshotQuantityDelta(log: OperationLog): number {
    const oldData = this.parseLogJson<any>(log.old_data)
    const newData = this.parseLogJson<any>(log.new_data)
    const oldQty = Number(oldData?.quantity)
    const newQty = Number(newData?.quantity)
    if (!Number.isFinite(oldQty) || !Number.isFinite(newQty)) return 0
    return newQty - oldQty
  }

  private getStockLogDetails(log: OperationLog): StockLogDetail[] {
    const payload = this.parseLogJson<{ items?: StockLogDetail[] }>(log.details)
    if (Array.isArray(payload?.items)) return payload.items

    const oldData = this.parseLogJson<any>(log.old_data)
    const newData = this.parseLogJson<any>(log.new_data)
    if (!oldData || !newData) return []
    return [{
      inventory_id: log.target_id,
      name: oldData.name || '',
      value: oldData.value || '',
      category: oldData.category || '',
      package: oldData.package || '',
      before: Number(oldData.quantity) || 0,
      after: Number(newData.quantity) || 0,
      delta: (Number(newData.quantity) || 0) - (Number(oldData.quantity) || 0)
    }]
  }

  private undoStockLog(log: OperationLog) {
    const details = this.getStockLogDetails(log)
    if (details.length === 0) throw new Error('UNDO_DATA_MISSING')

    const oldSnapshot = this.parseLogJson<any>(log.old_data)
    const newSnapshot = this.parseLogJson<any>(log.new_data)
    const rows = details.map(detail => {
      const current = this.db.prepare("SELECT * FROM inventory WHERE id = ?")
        .get(detail.inventory_id) as any
      if (!current) throw new Error(`UNDO_CONFLICT:inventory ${detail.inventory_id} is missing`)
      if (
        details.length === 1 &&
        oldSnapshot &&
        newSnapshot &&
        !this.inventoryMetadataEqual(current, newSnapshot)
      ) {
        throw new Error(`UNDO_CONFLICT:inventory ${detail.inventory_id} metadata changed`)
      }
      const restoredQuantity = current.quantity - detail.delta
      if (!Number.isInteger(restoredQuantity) || restoredQuantity < 0) {
        throw new Error(`UNDO_CONFLICT:inventory ${detail.inventory_id} has insufficient stock`)
      }
      return { id: detail.inventory_id, quantity: restoredQuantity }
    })

    const update = this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?")
    for (const row of rows) {
      if (details.length === 1 && oldSnapshot && newSnapshot) {
        this.writeInventorySnapshot({ ...oldSnapshot, quantity: row.quantity })
      } else {
        update.run(row.quantity, row.id)
      }
    }
  }

  private undoCsvImport(log: OperationLog) {
    const payload = this.parseLogJson<{
      changes?: Array<{ action: 'insert' | 'overwrite'; id: number; before: any | null; after: any }>
    }>(log.details)
    const changes = payload?.changes
    if (!Array.isArray(changes) || changes.length === 0) throw new Error('UNDO_DATA_MISSING')

    for (const change of [...changes].reverse()) {
      const current = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(change.id) as any
      if (!current || !this.inventorySnapshotsEqual(current, change.after)) {
        throw new Error(`UNDO_CONFLICT:inventory ${change.id} changed after import`)
      }

      if (change.action === 'insert') {
        const dependency = this.db.prepare("SELECT 1 FROM project_items WHERE inventory_id = ? LIMIT 1")
          .get(change.id)
        if (dependency) throw new Error(`UNDO_CONFLICT:inventory ${change.id} is referenced`)
        this.db.prepare("DELETE FROM inventory WHERE id = ?").run(change.id)
      } else {
        this.writeInventorySnapshot(change.before)
      }
    }
  }

  private undoInventoryCreate(log: OperationLog) {
    const expected = this.parseLogJson<any>(log.new_data)
    const current = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(log.target_id) as any
    if (!current || !expected || !this.inventorySnapshotsEqual(current, expected)) {
      throw new Error('UNDO_CONFLICT:inventory changed after creation')
    }
    const dependency = this.db.prepare("SELECT 1 FROM project_items WHERE inventory_id = ? LIMIT 1")
      .get(log.target_id)
    if (dependency) throw new Error('UNDO_CONFLICT:inventory is referenced')
    this.db.prepare("DELETE FROM inventory WHERE id = ?").run(log.target_id)
  }

  private restoreDeletedInventory(log: OperationLog) {
    const snapshot = this.parseLogJson<any>(log.old_data)
    if (!snapshot) throw new Error('UNDO_DATA_MISSING')
    if (this.db.prepare("SELECT 1 FROM inventory WHERE id = ?").get(log.target_id)) {
      throw new Error('UNDO_CONFLICT:inventory id already exists')
    }
    this.writeInventorySnapshot(snapshot)
  }

  private restoreUpdatedInventory(log: OperationLog) {
    const oldSnapshot = this.parseLogJson<any>(log.old_data)
    const newSnapshot = this.parseLogJson<any>(log.new_data)
    const current = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(log.target_id) as any
    if (!oldSnapshot || !newSnapshot || !current || !this.inventorySnapshotsEqual(current, newSnapshot)) {
      throw new Error('UNDO_CONFLICT:inventory changed after update')
    }
    this.writeInventorySnapshot(oldSnapshot)
  }

  private undoProjectCreate(log: OperationLog) {
    const current = this.getProjectSnapshot(log.target_id)
    const expected = this.parseLogJson<any>(log.new_data)
    if (!current || !expected || !this.projectSnapshotsEqual(current, expected)) {
      throw new Error('UNDO_CONFLICT:project changed after creation')
    }
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(log.target_id)
  }

  private restoreDeletedProject(log: OperationLog) {
    const snapshot = this.parseLogJson<any>(log.old_data)
    if (!snapshot?.project) throw new Error('UNDO_DATA_MISSING')
    if (this.db.prepare("SELECT 1 FROM projects WHERE id = ?").get(log.target_id)) {
      throw new Error('UNDO_CONFLICT:project id already exists')
    }
    this.writeProjectSnapshot(snapshot)
  }

  private restoreUpdatedProject(log: OperationLog) {
    const oldSnapshot = this.parseLogJson<any>(log.old_data)
    const newSnapshot = this.parseLogJson<any>(log.new_data)
    const current = this.getProjectSnapshot(log.target_id)
    if (!oldSnapshot || !newSnapshot || !current || !this.projectSnapshotsEqual(current, newSnapshot)) {
      throw new Error('UNDO_CONFLICT:project changed after update')
    }
    this.writeProjectSnapshot(oldSnapshot)
  }

  private undoLegacyLog(log: OperationLog) {
    const oldData = this.parseLogJson<any>(log.old_data)
    if (log.op_type === 'STOCK') {
      this.undoStockLog(log)
    } else if (log.op_type === 'CREATE' && log.target_type === 'INVENTORY') {
      this.undoInventoryCreate(log)
    } else if (log.op_type === 'CREATE' && log.target_type === 'PROJECT') {
      this.undoProjectCreate(log)
    } else if (log.op_type === 'DELETE' && log.target_type === 'INVENTORY') {
      this.restoreDeletedInventory(log)
    } else if (log.op_type === 'DELETE' && log.target_type === 'PROJECT') {
      this.restoreDeletedProject(log)
    } else if (log.op_type === 'UPDATE' && log.target_type === 'INVENTORY') {
      this.restoreUpdatedInventory(log)
    } else if (log.op_type === 'UPDATE' && log.target_type === 'PROJECT') {
      this.restoreUpdatedProject(log)
    } else if (!oldData) {
      throw new Error('UNDO_NOT_SUPPORTED')
    }
  }

  private writeInventorySnapshot(snapshot: any) {
    this.db.prepare(`
      INSERT INTO inventory (id, category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths)
      VALUES (@id, @category, @name, @value, @package, @quantity, @location, @min_stock, @image_paths, @datasheet_paths)
      ON CONFLICT(id) DO UPDATE SET
        category=excluded.category,
        name=excluded.name,
        value=excluded.value,
        package=excluded.package,
        quantity=excluded.quantity,
        location=excluded.location,
        min_stock=excluded.min_stock,
        image_paths=excluded.image_paths,
        datasheet_paths=excluded.datasheet_paths
    `).run({
      ...snapshot,
      image_paths: snapshot.image_paths || '[]',
      datasheet_paths: snapshot.datasheet_paths || '[]'
    })
  }

  private inventorySnapshotsEqual(left: any, right: any): boolean {
    const fields = [
      'id', 'category', 'name', 'value', 'package', 'quantity',
      'location', 'min_stock', 'image_paths', 'datasheet_paths'
    ]
    return fields.every(field => {
      const leftValue = left?.[field] ?? (field.endsWith('_paths') ? '[]' : '')
      const rightValue = right?.[field] ?? (field.endsWith('_paths') ? '[]' : '')
      return leftValue === rightValue
    })
  }

  private inventoryMetadataEqual(left: any, right: any): boolean {
    const fields = [
      'id', 'category', 'name', 'value', 'package',
      'location', 'min_stock', 'image_paths', 'datasheet_paths'
    ]
    return fields.every(field => {
      const leftValue = left?.[field] ?? (field.endsWith('_paths') ? '[]' : '')
      const rightValue = right?.[field] ?? (field.endsWith('_paths') ? '[]' : '')
      return leftValue === rightValue
    })
  }

  private getProjectSnapshot(projectId: number) {
    const project = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any
    if (!project) return null
    const items = this.db.prepare(`
      SELECT project_id, inventory_id, quantity
      FROM project_items WHERE project_id = ?
      ORDER BY inventory_id ASC
    `).all(projectId)
    return { project, items }
  }

  private writeProjectSnapshot(snapshot: any) {
    const project = snapshot.project
    this.db.prepare(`
      INSERT INTO projects (id, name, description, created_at, order_index, files)
      VALUES (@id, @name, @description, @created_at, @order_index, @files)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        created_at=excluded.created_at,
        order_index=excluded.order_index,
        files=excluded.files
    `).run({ ...project, files: project.files || '[]' })

    this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(project.id)
    const insert = this.db.prepare(
      "INSERT INTO project_items (project_id, inventory_id, quantity) VALUES (?, ?, ?)"
    )
    for (const item of snapshot.items || []) {
      insert.run(project.id, item.inventory_id, item.quantity)
    }
  }

  private projectSnapshotsEqual(left: any, right: any): boolean {
    const leftProject = left?.project || left
    const rightProject = right?.project || right
    const projectFields = ['id', 'name', 'description', 'created_at', 'order_index', 'files']
    const projectEqual = projectFields.every(field => {
      if (rightProject?.[field] === undefined || rightProject?.[field] === null) return true
      return (leftProject?.[field] ?? (field === 'files' ? '[]' : '')) === rightProject[field]
    })
    if (!projectEqual) return false

    const normalizeItems = (items: any[] = []) => items
      .map(item => ({
        inventory_id: item.inventory_id,
        quantity: item.quantity
      }))
      .sort((a, b) => a.inventory_id - b.inventory_id)
    return JSON.stringify(normalizeItems(left?.items)) === JSON.stringify(normalizeItems(right?.items))
  }

  public fetchCategories(): string[] {
    const rows = this.db.prepare("SELECT DISTINCT category FROM inventory").all() as any[]
    const dbCats = rows.map(r => r.category).filter(c => c)
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats])).sort()
  }

  public fetchPackages(category?: string): string[] {
    let sql = "SELECT DISTINCT package FROM inventory WHERE package IS NOT NULL AND package != ''"
    const params: any[] = []
    if (category && category !== 'All Categories' && category !== '全部分类') {
      sql += " AND category = ?"
      params.push(category)
    }
    sql += " ORDER BY package ASC"
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => r.package)
  }

  public fetchGrouped(filters: FilterOptions = {}): Record<string, InventoryItem[]> {
    let sql = `
      SELECT inventory.*, COUNT(project_items.project_id) as ref_count 
      FROM inventory 
      LEFT JOIN project_items ON inventory.id = project_items.inventory_id 
      WHERE 1=1
    `
    const params: any[] = []

    if (filters.keyword?.trim()) {
      const rawKey = filters.keyword.trim()
      const greekMuKey = rawKey.replace(/u/gi, '\u03BC')
      const microSignKey = rawKey.replace(/u/gi, '\u00B5')
      const pRaw = `%${rawKey}%`
      const pGreek = `%${greekMuKey}%`
      const pMicro = `%${microSignKey}%`

      sql += ` AND (
        (inventory.name LIKE ? OR inventory.name LIKE ? OR inventory.name LIKE ?) OR 
        (inventory.value LIKE ? OR inventory.value LIKE ? OR inventory.value LIKE ?) OR 
        (inventory.location LIKE ? OR inventory.location LIKE ? OR inventory.location LIKE ?)
      )`
      params.push(pRaw, pGreek, pMicro, pRaw, pGreek, pMicro, pRaw, pGreek, pMicro)
    }

    if (filters.category && !['全部分类', 'All Categories'].includes(filters.category)) {
      sql += " AND inventory.category = ?"
      params.push(filters.category)
    }
    if (filters.package && !['全部封装', 'All Packages'].includes(filters.package)) {
      sql += " AND inventory.package = ?"
      params.push(filters.package)
    }

    sql += " GROUP BY inventory.id"

    let orderMap = new Map<number, number>()
    try {
        const sortRow = this.db.prepare("SELECT id_order FROM sort_orders WHERE table_name = 'inventory'").get() as any
        if (sortRow && sortRow.id_order) {
            JSON.parse(sortRow.id_order).forEach((id: number, index: number) => orderMap.set(id, index))
        }
    } catch(e) {}

    const rows = this.db.prepare(sql).all(...params) as InventoryItem[]
    
    rows.sort((a, b) => {
        const oa = orderMap.has(a.id!) ? orderMap.get(a.id!)! : 999999
        const ob = orderMap.has(b.id!) ? orderMap.get(b.id!)! : 999999
        if (oa !== ob) return oa - ob
        if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '')
        return (a.name || '').localeCompare(b.name || '')
    })

    const grouped: Record<string, InventoryItem[]> = {}
    for (const row of rows) {
      const cat = row.category || "Uncategorized"
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(row)
    }
    return grouped
  }

  public getInventoryHealthStats(): InventoryHealthStats {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
        COALESCE(SUM(
          CASE
            WHEN quantity > 0 AND quantity <= COALESCE(min_stock, 10) THEN 1
            ELSE 0
          END
        ), 0) AS low_stock
      FROM inventory
    `).get() as { total: number; out_of_stock: number; low_stock: number }

    const outOfStock = Number(row.out_of_stock) || 0
    const lowStock = Number(row.low_stock) || 0
    return {
      total: Number(row.total) || 0,
      outOfStock,
      lowStock,
      warningLevel: outOfStock > 0 ? 2 : lowStock > 0 ? 1 : 0
    }
  }

  public updateQty(id: number, qty: number) {
    this.assertPositiveInteger(id, 'id')
    this.assertNonNegativeInteger(qty, 'qty')

    const tx = this.db.transaction(() => {
      const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(id) as any
      if (!oldItem) throw new Error(`NOT_FOUND:inventory ${id}`)
      if (oldItem.quantity === qty) return

      this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?").run(qty, id)
      const delta = qty - oldItem.quantity
      const eventCode: OperationEventCode = delta > 0
        ? 'INVENTORY_MANUAL_IN'
        : 'INVENTORY_MANUAL_OUT'
      const detail: StockLogDetail = {
        inventory_id: id,
        name: oldItem.name || '',
        value: oldItem.value || '',
        category: oldItem.category || '',
        package: oldItem.package || '',
        before: oldItem.quantity,
        after: qty,
        delta
      }

      this.addLog({
        op_type: 'STOCK',
        target_type: 'INVENTORY',
        target_id: id,
        event_code: eventCode,
        summary_key: delta > 0 ? 'log.inventory.manualIn' : 'log.inventory.manualOut',
        summary_params: JSON.stringify({
          name: oldItem.name,
          value: oldItem.value,
          qty: Math.abs(delta),
          old: oldItem.quantity,
          new: qty
        }),
        details: JSON.stringify({ items: [detail] }),
        undoable: 1,
        old_data: JSON.stringify(oldItem),
        new_data: JSON.stringify({ ...oldItem, quantity: qty })
      })
    })
    tx()
  }

  public batchUpdateQty(updates: QuantityUpdate[]) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('VALIDATION_ERROR:updates must be a non-empty array')
    }

    const ids = new Set<number>()
    for (const update of updates) {
      this.assertPositiveInteger(update?.id, 'updates.id')
      this.assertNonNegativeInteger(update?.qty, 'updates.qty')
      if (ids.has(update.id)) {
        throw new Error(`VALIDATION_ERROR:duplicate inventory id ${update.id}`)
      }
      ids.add(update.id)
    }

    const getStmt = this.db.prepare("SELECT * FROM inventory WHERE id = ?")
    const updateStmt = this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?")
    const tx = this.db.transaction(() => {
      const oldItems = updates.map(update => {
        const oldItem = getStmt.get(update.id) as any
        if (!oldItem) throw new Error(`NOT_FOUND:inventory ${update.id}`)
        return { update, oldItem }
      })

      const details: StockLogDetail[] = []
      for (const { update, oldItem } of oldItems) {
        if (update.qty === oldItem.quantity) continue
        updateStmt.run(update.qty, update.id)
        details.push({
          inventory_id: update.id,
          name: oldItem.name || '',
          value: oldItem.value || '',
          category: oldItem.category || '',
          package: oldItem.package || '',
          before: oldItem.quantity,
          after: update.qty,
          delta: update.qty - oldItem.quantity
        })
      }

      if (details.length > 0) {
        const inbound = details.filter(item => item.delta > 0).reduce((sum, item) => sum + item.delta, 0)
        const outbound = details.filter(item => item.delta < 0).reduce((sum, item) => sum + Math.abs(item.delta), 0)
        const singleDetail = details.length === 1 ? details[0] : null
        const eventCode: OperationEventCode = singleDetail
          ? singleDetail.delta > 0
            ? 'INVENTORY_MANUAL_IN'
            : 'INVENTORY_MANUAL_OUT'
          : 'INVENTORY_BATCH_ADJUST'
        this.addLog({
          op_type: 'STOCK',
          target_type: 'INVENTORY',
          target_id: singleDetail?.inventory_id || 0,
          event_code: eventCode,
          summary_key: singleDetail
            ? singleDetail.delta > 0
              ? 'log.inventory.manualIn'
              : 'log.inventory.manualOut'
            : 'log.inventory.batchAdjust',
          summary_params: JSON.stringify(singleDetail
            ? {
                name: singleDetail.name,
                value: singleDetail.value,
                qty: Math.abs(singleDetail.delta),
                old: singleDetail.before,
                new: singleDetail.after
              }
            : { count: details.length, inbound, outbound }),
          details: JSON.stringify({ items: details, inbound, outbound }),
          undoable: 1
        })
      }
    })
    tx()
  }

  public deleteItem(id: number) {
    this.assertPositiveInteger(id, 'id')

    const tx = this.db.transaction(() => {
      const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(id) as any
      if (!oldItem) throw new Error(`NOT_FOUND:inventory ${id}`)

      const projects = this.db.prepare(`
        SELECT DISTINCT p.name
        FROM projects p
        JOIN project_items pi ON p.id = pi.project_id
        WHERE pi.inventory_id = ?
        ORDER BY p.name ASC
      `).all(id) as { name: string }[]

      if (projects.length > 0) {
        throw new Error(`INVENTORY_IN_USE:${JSON.stringify(projects.map(project => project.name))}`)
      }

      this.db.prepare('DELETE FROM inventory WHERE id = ?').run(id)
      this.addLog({
        op_type: 'DELETE',
        target_type: 'INVENTORY',
        target_id: id,
        event_code: 'INVENTORY_DELETE',
        summary_key: 'log.inventory.delete',
        summary_params: JSON.stringify({ name: oldItem.name, value: oldItem.value }),
        undoable: 1,
        old_data: JSON.stringify(oldItem)
      })
    })
    tx()
  }

  public upsert(data: InventoryItem) {
    this.validateInventoryItem(data)

    const minStock = (data.min_stock !== undefined && data.min_stock !== null) ? data.min_stock : 10
    const imgPaths = data.image_paths || '[]'
    const docPaths = data.datasheet_paths || '[]'

    const tx = this.db.transaction(() => {
      if (data.id) {
        const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(data.id) as any
        if (!oldItem) throw new Error(`NOT_FOUND:inventory ${data.id}`)
        
        this.db.prepare(`
          UPDATE inventory 
          SET category=@category, name=@name, value=@value, package=@package, quantity=@quantity, location=@location, min_stock=@min_stock, image_paths=@image_paths, datasheet_paths=@datasheet_paths
          WHERE id=@id
        `).run({ ...data, min_stock: minStock, image_paths: imgPaths, datasheet_paths: docPaths })

        const newItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(data.id) as any
        const quantityDelta = newItem.quantity - oldItem.quantity
        const eventCode: OperationEventCode = quantityDelta > 0
          ? 'INVENTORY_MANUAL_IN'
          : quantityDelta < 0
            ? 'INVENTORY_MANUAL_OUT'
            : 'INVENTORY_UPDATE'
        const details = quantityDelta === 0 ? undefined : JSON.stringify({
          items: [{
            inventory_id: data.id,
            name: newItem.name || '',
            value: newItem.value || '',
            category: newItem.category || '',
            package: newItem.package || '',
            before: oldItem.quantity,
            after: newItem.quantity,
            delta: quantityDelta
          } satisfies StockLogDetail]
        })

        this.addLog({
          op_type: quantityDelta === 0 ? 'UPDATE' : 'STOCK',
          target_type: 'INVENTORY',
          target_id: data.id,
          event_code: eventCode,
          summary_key: quantityDelta > 0
            ? 'log.inventory.manualIn'
            : quantityDelta < 0
              ? 'log.inventory.manualOut'
              : 'log.inventory.update',
          summary_params: JSON.stringify({
            name: data.name,
            value: data.value,
            qty: Math.abs(quantityDelta),
            old: oldItem.quantity,
            new: newItem.quantity
          }),
          details,
          undoable: 1,
          old_data: JSON.stringify(oldItem),
          new_data: JSON.stringify(newItem)
        })

      } else {
        const existing = this.db.prepare(`SELECT * FROM inventory WHERE category=? AND name=? AND value=? AND package=? AND location=?`).get(data.category, data.name, data.value, data.package, data.location) as any
        
        if (existing) {
           const newQty = existing.quantity + data.quantity
           this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?").run(newQty, existing.id)
           if (data.quantity > 0) {
             const newItem = { ...existing, quantity: newQty }
             this.addLog({
               op_type: 'STOCK',
               target_type: 'INVENTORY',
               target_id: existing.id,
               event_code: 'INVENTORY_MANUAL_IN',
               summary_key: 'log.inventory.manualIn',
               summary_params: JSON.stringify({
                 name: existing.name,
                 value: existing.value,
                 qty: data.quantity,
                 old: existing.quantity,
                 new: newQty
               }),
               details: JSON.stringify({
                 items: [{
                   inventory_id: existing.id,
                   name: existing.name || '',
                   value: existing.value || '',
                   category: existing.category || '',
                   package: existing.package || '',
                   before: existing.quantity,
                   after: newQty,
                   delta: data.quantity
                 } satisfies StockLogDetail]
               }),
               undoable: 1,
               old_data: JSON.stringify(existing),
               new_data: JSON.stringify(newItem)
             })
           }
        } else {
           const info = this.db.prepare(`
             INSERT INTO inventory (category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths) 
             VALUES (@category, @name, @value, @package, @quantity, @location, @min_stock, @image_paths, @datasheet_paths)
           `).run({ ...data, min_stock: minStock, image_paths: imgPaths, datasheet_paths: docPaths })
           
           const newId = info.lastInsertRowid as number
           
           this.addLog({
             op_type: 'CREATE',
             target_type: 'INVENTORY',
             target_id: newId,
             event_code: 'INVENTORY_CREATE',
             summary_key: 'log.inventory.create',
             summary_params: JSON.stringify({ name: data.name, value: data.value }),
             undoable: 1,
             old_data: JSON.stringify(null),
             new_data: JSON.stringify(
               this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(newId)
             )
           })
        }
      }
    })
    tx()
  }

  public getProjects(query: string = "", ids?: number[]): BomProject[] {
    let sql = "SELECT * FROM projects WHERE 1=1"
    const params: any[] = []
    
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      sql += ` AND id IN (${placeholders})`
      params.push(...ids)
    } else if (query?.trim()) {
      sql += " AND (name LIKE ? OR description LIKE ?)"
      const p = `%${query}%`
      params.push(p, p)
    }
    
    let orderMap = new Map<number, number>()
    try {
        const sortRow = this.db.prepare("SELECT id_order FROM sort_orders WHERE table_name = 'projects'").get() as any
        if (sortRow && sortRow.id_order) {
            JSON.parse(sortRow.id_order).forEach((id: number, index: number) => orderMap.set(id, index))
        }
    } catch(e) {}

    const rows = this.db.prepare(sql).all(...params) as BomProject[]
    rows.sort((a, b) => {
        const oa = orderMap.has(a.id!) ? orderMap.get(a.id!)! : 999999
        const ob = orderMap.has(b.id!) ? orderMap.get(b.id!)! : 999999
        return oa - ob
    })

    return rows
  }

  public getRelatedProjects(inventoryId: number): { id: number, name: string }[] {
    this.assertPositiveInteger(inventoryId, 'inventoryId')

    const sql = `
      SELECT p.id, p.name 
      FROM projects p
      JOIN project_items pi ON p.id = pi.project_id
      WHERE pi.inventory_id = ?
      ORDER BY p.name ASC
    `
    return this.db.prepare(sql).all(inventoryId) as { id: number, name: string }[]
  }

  public getProjectDetail(projectId: number): BomItem[] {
    this.assertPositiveInteger(projectId, 'projectId')

    const sql = `
      SELECT 
        pi.inventory_id, pi.quantity,
        i.name, i.value, i.package, i.category, 
        i.quantity as current_stock
      FROM project_items pi
      JOIN inventory i ON pi.inventory_id = i.id
      WHERE pi.project_id = ?
    `
    return this.db.prepare(sql).all(projectId) as BomItem[]
  }

  public saveProject(project: BomProject) {
    this.validateProject(project)

    const tx = this.db.transaction(() => {
      let pid = project.id
      const filesJson = project.files || '[]'

      if (pid) {
        const oldProject = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(pid)
        if (!oldProject) throw new Error(`NOT_FOUND:project ${pid}`)
        const oldItems = this.db.prepare("SELECT * FROM project_items WHERE project_id = ?").all(pid)
        const oldSnapshot = { project: oldProject, items: oldItems }

        this.db.prepare("UPDATE projects SET name = ?, description = ?, files = ? WHERE id = ?")
          .run(project.name, project.description, filesJson, pid)
        
        this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(pid)
        
        const insertItem = this.db.prepare("INSERT INTO project_items (project_id, inventory_id, quantity) VALUES (?, ?, ?)")
        for (const item of project.items || []) {
          insertItem.run(pid, item.inventory_id, item.quantity)
        }

        const newSnapshot = this.getProjectSnapshot(pid)
        this.addLog({
          op_type: 'UPDATE',
          target_type: 'PROJECT',
          target_id: pid,
          event_code: 'PROJECT_UPDATE',
          summary_key: 'log.project.update',
          summary_params: JSON.stringify({ name: project.name }),
          undoable: 1,
          old_data: JSON.stringify(oldSnapshot),
          new_data: JSON.stringify(newSnapshot)
        })

      } else {
        const maxOrderObj = this.db.prepare("SELECT MAX(order_index) as maxVal FROM projects").get() as any
        const nextOrder = (maxOrderObj?.maxVal || 0) + 1

        const info = this.db.prepare("INSERT INTO projects (name, description, order_index, files) VALUES (?, ?, ?, ?)").run(project.name, project.description, nextOrder, filesJson)
        pid = info.lastInsertRowid as number

        const insertItem = this.db.prepare("INSERT INTO project_items (project_id, inventory_id, quantity) VALUES (?, ?, ?)")
        for (const item of project.items || []) {
          insertItem.run(pid, item.inventory_id, item.quantity)
        }

        const newSnapshot = this.getProjectSnapshot(pid)
        this.addLog({
          op_type: 'CREATE',
          target_type: 'PROJECT',
          target_id: pid,
          event_code: 'PROJECT_CREATE',
          summary_key: 'log.project.create',
          summary_params: JSON.stringify({ name: project.name }),
          undoable: 1,
          old_data: undefined,
          new_data: JSON.stringify(newSnapshot)
        })
      }
    })
    tx()
  }

  public deleteProject(id: number) {
    this.assertPositiveInteger(id, 'id')

    const tx = this.db.transaction(() => {
      const project = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any
      if (!project) throw new Error(`NOT_FOUND:project ${id}`)
      const items = this.db.prepare("SELECT * FROM project_items WHERE project_id = ?").all(id)
      const snapshot = { project, items }

      this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(id)
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(id)

      this.addLog({
        op_type: 'DELETE',
        target_type: 'PROJECT',
        target_id: id,
        event_code: 'PROJECT_DELETE',
        summary_key: 'log.project.delete',
        summary_params: JSON.stringify({ name: project.name }),
        undoable: 1,
        old_data: JSON.stringify(snapshot)
      })
    })
    tx()
  }

  public executeDeduction(items: DeductionItem[], context: DeductionContext = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('VALIDATION_ERROR:deduction items must be a non-empty array')
    }

    const ids = new Set<number>()
    for (const item of items) {
      this.assertPositiveInteger(item?.id, 'deduction.id')
      this.assertPositiveInteger(item?.deductQty, 'deduction.deductQty')
      if (ids.has(item.id)) {
        throw new Error(`VALIDATION_ERROR:duplicate inventory id ${item.id}`)
      }
      ids.add(item.id)
    }

    const stmt = this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?")
    const getStmt = this.db.prepare("SELECT * FROM inventory WHERE id = ?")
    
    const tx = this.db.transaction(() => {
      const oldItems = items.map(item => {
        const oldItem = getStmt.get(item.id) as any
        if (!oldItem) throw new Error(`NOT_FOUND:inventory ${item.id}`)
        if (!context.allowNegative && oldItem.quantity < item.deductQty) {
          throw new Error(`INSUFFICIENT_STOCK:${JSON.stringify({
            id: item.id,
            available: oldItem.quantity,
            requested: item.deductQty
          })}`)
        }
        return { item, oldItem }
      })

      const details: StockLogDetail[] = []
      for (const { item, oldItem } of oldItems) {
        const newQty = oldItem.quantity - item.deductQty
        stmt.run(newQty, item.id)
        details.push({
          inventory_id: item.id,
          name: oldItem.name || '',
          value: oldItem.value || '',
          category: oldItem.category || '',
          package: oldItem.package || '',
          before: oldItem.quantity,
          after: newQty,
          delta: -item.deductQty
        })
      }

      const total = details.reduce((sum, item) => sum + Math.abs(item.delta), 0)
      this.addLog({
        op_type: 'STOCK',
        target_type: context.projectId ? 'PROJECT' : 'INVENTORY',
        target_id: context.projectId || 0,
        event_code: 'BOM_PRODUCTION_DEDUCTION',
        summary_key: 'log.inventory.bomDeduction',
        summary_params: JSON.stringify({
          project: context.projectName || '',
          productionQuantity: context.productionQuantity || 1,
          count: details.length,
          total
        }),
        details: JSON.stringify({
          items: details,
          projectId: context.projectId || null,
          projectName: context.projectName || '',
          productionQuantity: context.productionQuantity || 1,
          total
        }),
        undoable: 1
      })
    })
    tx()
  }

  public updateSortOrder(tableName: 'projects' | 'inventory', ids: number[]) {
    if (!['projects', 'inventory'].includes(tableName)) {
      throw new Error('VALIDATION_ERROR:unknown sort table')
    }
    if (!Array.isArray(ids)) {
      throw new Error('VALIDATION_ERROR:sort ids must be an array')
    }

    const submitted = new Set<number>()
    for (const id of ids) {
      this.assertPositiveInteger(id, 'sort.id')
      if (submitted.has(id)) throw new Error(`VALIDATION_ERROR:duplicate sort id ${id}`)
      submitted.add(id)
    }

    const table = tableName === 'projects' ? 'projects' : 'inventory'
    const existingIds = (this.db.prepare(`SELECT id FROM ${table} ORDER BY id ASC`).all() as { id: number }[])
      .map(row => row.id)
    const existingSet = new Set(existingIds)
    if (ids.some(id => !existingSet.has(id))) {
      throw new Error('VALIDATION_ERROR:sort order contains missing ids')
    }

    let previousIds: number[] = []
    const row = this.db.prepare("SELECT id_order FROM sort_orders WHERE table_name = ?").get(tableName) as any
    if (row?.id_order) {
      try {
        const parsed = JSON.parse(row.id_order)
        if (Array.isArray(parsed)) previousIds = parsed
      } catch {
        previousIds = []
      }
    }

    const mergedIds = [...ids]
    const seen = new Set(ids)
    for (const id of [...previousIds, ...existingIds]) {
      if (Number.isInteger(id) && existingSet.has(id) && !seen.has(id)) {
        mergedIds.push(id)
        seen.add(id)
      }
    }

    this.db.prepare(`INSERT OR REPLACE INTO sort_orders (table_name, id_order) VALUES (?, ?)`)
      .run(tableName, JSON.stringify(mergedIds))
  }

  public getCategoryRule(category: string): CategoryRule {
    const row = this.db.prepare("SELECT rule_json FROM category_rules WHERE category = ?").get(category) as any
    if (row) return JSON.parse(row.rule_json)
    if (SYSTEM_DEFAULTS[category]) return SYSTEM_DEFAULTS[category]
    return GENERIC_RULE
  }

  public getAllCategoryRules(): Record<string, CategoryRule> {
    if (!this.categoryRulesCache) {
      const customRows = this.db.prepare(
        "SELECT category, rule_json FROM category_rules"
      ).all() as Array<{ category: string; rule_json: string }>
      const rules: Record<string, CategoryRule> = {
        ...SYSTEM_DEFAULTS,
        __generic__: GENERIC_RULE
      }
      for (const row of customRows) {
        try {
          rules[row.category] = JSON.parse(row.rule_json) as CategoryRule
        } catch {
          // Ignore malformed legacy custom rules and fall back to defaults.
        }
      }
      this.categoryRulesCache = rules
    }
    return JSON.parse(JSON.stringify(this.categoryRulesCache)) as Record<string, CategoryRule>
  }

  public saveCategoryRule(category: string, rule: CategoryRule) {
    this.db.prepare("INSERT OR REPLACE INTO category_rules (category, rule_json) VALUES (?, ?)").run(category, JSON.stringify(rule))
    this.categoryRulesCache = null
  }

  public resetCategoryRule(category: string) {
    this.db.prepare("DELETE FROM category_rules WHERE category = ?").run(category)
    this.categoryRulesCache = null
  }
  
  public getAllInventoryForExport(): any[] {
    return this.db.prepare("SELECT * FROM inventory ORDER BY id ASC").all()
  }

  public getAllProjectsForExport(): any[] {
    const projects = this.db.prepare("SELECT * FROM projects ORDER BY id ASC").all() as any[]
    for (const p of projects) {
      p.items = this.db.prepare(`
        SELECT pi.inventory_id, pi.quantity, i.name, i.value, i.package 
        FROM project_items pi
        LEFT JOIN inventory i ON pi.inventory_id = i.id
        WHERE pi.project_id = ?
      `).all(p.id)
    }
    return projects
  }

  public batchImportInventory(items: InventoryImportItem[], mode: ImportStrategy) {
    if (!Array.isArray(items)) {
      throw new Error('VALIDATION_ERROR:import items must be an array')
    }
    if (!['skip', 'overwrite', 'keep_both'].includes(mode)) {
      throw new Error('VALIDATION_ERROR:unknown import strategy')
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO inventory (category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths)
      VALUES (@category, @name, @value, @package, @quantity, @location, @min_stock, '[]', '[]')
    `)

    const updateStmt = this.db.prepare(`
      UPDATE inventory 
      SET category=@category, name=@name, value=@value, package=@package, quantity=@quantity, location=@location, min_stock=@min_stock
      WHERE id=@id
    `)

    const findStmt = this.db.prepare(`
      SELECT * FROM inventory
      WHERE category = ? AND name = ? AND value = ? AND package = ? AND location = ?
    `)

    const tx = this.db.transaction(() => {
      let successCount = 0
      let skipCount = 0
      const changes: Array<{
        action: 'insert' | 'overwrite'
        id: number
        before: StoredInventoryItem | null
        after: StoredInventoryItem
      }> = []

      for (const item of items) {
        const quantityRaw = item.quantity === '' || item.quantity === undefined || item.quantity === null
          ? 0
          : Number(item.quantity)
        const minStockRaw = item.min_stock === '' || item.min_stock === undefined || item.min_stock === null
          ? 10
          : Number(item.min_stock)

        const safeItem = {
          category: String(item.category || 'Uncategorized').trim(),
          name: String(item.name || '').trim(),
          value: String(item.value || '').trim(),
          package: String(item.package || '').trim(),
          quantity: quantityRaw,
          location: String(item.location || '').trim(),
          min_stock: minStockRaw
        }
        this.validateInventoryItem(safeItem)

        const exist = findStmt.get(
          safeItem.category,
          safeItem.name,
          safeItem.value,
          safeItem.package,
          safeItem.location
        ) as StoredInventoryItem | undefined

        if (exist) {
          if (mode === 'skip') {
            skipCount++
            continue
          } else if (mode === 'overwrite') {
            updateStmt.run({ ...safeItem, id: exist.id })
            const after = this.db.prepare(
              'SELECT * FROM inventory WHERE id = ?'
            ).get(exist.id) as StoredInventoryItem
            changes.push({
              action: 'overwrite',
              id: exist.id,
              before: exist,
              after
            })
            successCount++
          } else {
            const baseName = safeItem.name || safeItem.value || 'Imported'
            let suffix = 1
            let candidate = `${baseName} (Imported)`
            while (findStmt.get(
              safeItem.category,
              candidate,
              safeItem.value,
              safeItem.package,
              safeItem.location
            )) {
              suffix++
              candidate = `${baseName} (Imported ${suffix})`
            }
            const info = insertStmt.run({ ...safeItem, name: candidate })
            const id = Number(info.lastInsertRowid)
            changes.push({
              action: 'insert',
              id,
              before: null,
              after: this.db.prepare(
                'SELECT * FROM inventory WHERE id = ?'
              ).get(id) as StoredInventoryItem
            })
            successCount++
          }
        } else {
          const info = insertStmt.run(safeItem)
          const id = Number(info.lastInsertRowid)
          changes.push({
            action: 'insert',
            id,
            before: null,
            after: this.db.prepare(
              'SELECT * FROM inventory WHERE id = ?'
            ).get(id) as StoredInventoryItem
          })
          successCount++
        }
      }

      this.addLog({
        op_type: 'IMPORT',
        target_type: 'INVENTORY',
        target_id: 0,
        event_code: 'CSV_IMPORT',
        summary_key: 'log.inventory.csvImport',
        summary_params: JSON.stringify({
          mode,
          success: successCount,
          skipped: skipCount
        }),
        details: JSON.stringify({
          mode,
          changes,
          success: successCount,
          skipped: skipCount
        }),
        undoable: changes.length > 0 ? 1 : 0
      })
      return { success: successCount, skipped: skipCount }
    })

    return tx()
  }

  // --- App Settings Methods ---

  private getSetting(key: string, defaultValue: any): any {
    try {
      const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as any
      if (row) return JSON.parse(row.value)
      return defaultValue
    } catch {
      return defaultValue
    }
  }

  private setSetting(key: string, value: any) {
    this.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value))
  }

  public getAppSettings(): AppSettings {
    const defaultBackupPath = isDevelopmentStorageMode()
      ? path.join(this.userDataPath, 'Backups')
      : path.join(app.getPath('documents'), 'SiliconVault', 'Backups')
    
    return {
      autoBackup: this.getSetting('autoBackup', false),
      backupFrequency: this.getSetting('backupFrequency', 'exit'),
      backupPath: isDevelopmentStorageMode()
        ? defaultBackupPath
        : this.getSetting('backupPath', defaultBackupPath),
      maxBackups: this.getSetting('maxBackups', 5)
    }
  }

  private cleanupOrphanProjectItems() {
    this.db.prepare(`
      DELETE FROM project_items
      WHERE project_id NOT IN (SELECT id FROM projects)
         OR inventory_id NOT IN (SELECT id FROM inventory)
    `).run()
  }

  private assertPositiveInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new Error(`VALIDATION_ERROR:${field} must be a positive integer`)
    }
  }

  private assertNonNegativeInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new Error(`VALIDATION_ERROR:${field} must be a non-negative integer`)
    }
  }

  private validateInventoryItem(data: InventoryItem) {
    if (!data || typeof data !== 'object') {
      throw new Error('VALIDATION_ERROR:inventory item is required')
    }
    if (data.id !== undefined) this.assertPositiveInteger(data.id, 'id')
    this.assertNonNegativeInteger(data.quantity, 'quantity')
    if (data.min_stock !== undefined && data.min_stock !== null) {
      this.assertNonNegativeInteger(data.min_stock, 'min_stock')
    }
    if (!String(data.name || '').trim() && !String(data.value || '').trim()) {
      throw new Error('VALIDATION_ERROR:inventory name or value is required')
    }
  }

  private validateProject(project: BomProject) {
    if (!project || typeof project !== 'object') {
      throw new Error('VALIDATION_ERROR:project is required')
    }
    if (project.id !== undefined) this.assertPositiveInteger(project.id, 'project.id')
    if (!String(project.name || '').trim()) {
      throw new Error('VALIDATION_ERROR:project.name is required')
    }

    const items = project.items || []
    if (!Array.isArray(items)) {
      throw new Error('VALIDATION_ERROR:project.items must be an array')
    }

    const ids = new Set<number>()
    for (const item of items) {
      this.assertPositiveInteger(item.inventory_id, 'project.items.inventory_id')
      this.assertPositiveInteger(item.quantity, 'project.items.quantity')
      if (ids.has(item.inventory_id)) {
        throw new Error(`VALIDATION_ERROR:duplicate inventory id ${item.inventory_id}`)
      }
      ids.add(item.inventory_id)
    }

    if (ids.size > 0) {
      const placeholders = Array.from(ids).map(() => '?').join(',')
      const rows = this.db.prepare(`SELECT id FROM inventory WHERE id IN (${placeholders})`)
        .all(...ids) as { id: number }[]
      if (rows.length !== ids.size) {
        throw new Error('VALIDATION_ERROR:project contains missing inventory items')
      }
    }
  }

  public saveAppSettings(settings: AppSettings): void {
    if (!settings || typeof settings !== 'object') {
      throw new Error('INVALID_BACKUP_SETTINGS')
    }
    if (typeof settings.autoBackup !== 'boolean') {
      throw new Error('INVALID_BACKUP_SETTINGS:autoBackup')
    }
    if (!['exit', '30min', '1h', '4h'].includes(settings.backupFrequency)) {
      throw new Error('INVALID_BACKUP_SETTINGS:backupFrequency')
    }
    if (typeof settings.backupPath !== 'string' || !settings.backupPath.trim()) {
      throw new Error('INVALID_BACKUP_SETTINGS:backupPath')
    }
    if (
      !Number.isSafeInteger(settings.maxBackups) ||
      settings.maxBackups < 1 ||
      settings.maxBackups > 100
    ) {
      throw new Error('INVALID_BACKUP_SETTINGS:maxBackups')
    }

    const safeSettings = isDevelopmentStorageMode()
      ? { ...settings, backupPath: path.join(this.userDataPath, 'Backups') }
      : settings

    const tx = this.db.transaction(() => {
      this.setSetting('autoBackup', safeSettings.autoBackup)
      this.setSetting('backupFrequency', safeSettings.backupFrequency)
      this.setSetting('backupPath', safeSettings.backupPath)
      this.setSetting('maxBackups', safeSettings.maxBackups)
    })
    tx()
  }
}

export const dbManager = new DBManager()
