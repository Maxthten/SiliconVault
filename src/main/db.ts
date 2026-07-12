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

// --- 类型定义 ---

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

export interface BomProject {
  id?: number
  name: string
  description: string
  created_at?: string
  items?: BomItem[]
  order_index?: number
  files?: string
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

export interface FilterOptions {
  keyword?: string
  category?: string
  package?: string
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
  layout?: CategoryLayout
}

export interface OperationLog {
  id?: number
  op_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK' | 'IMPORT' | 'EXPORT'
  target_type: 'INVENTORY' | 'PROJECT'
  target_id: number
  desc: string
  old_data?: string
  new_data?: string
  created_at?: string
}

export interface AppSettings {
  autoBackup: boolean
  backupFrequency: 'exit' | '30min' | '1h' | '4h'
  backupPath: string
  maxBackups: number
}

export type ImportStrategy = 'skip' | 'overwrite' | 'keep_both'

export interface QuantityUpdate {
  id: number
  qty: number
}

interface DeductionItem {
  id: number
  deductQty: number
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

  constructor(storagePathOverride?: string) {
    if (storagePathOverride) {
      this.userDataPath = path.resolve(storagePathOverride)
    } else if (isDevelopmentStorageMode()) {
      this.userDataPath = ensureDevelopmentStoragePath()
    } else {
      const store = new Store()
      const defaultPath = path.join(app.getPath('documents'), 'SiliconVault')
      this.userDataPath = (store.get('storagePath') as string) || defaultPath
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

    const dbPath = path.join(this.userDataPath, 'inventory.db')
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

    } catch (e) {
      console.error('数据库结构迁移失败', e)
    }
  }

  public addLog(log: OperationLog) {
    const safeLog = {
      op_type: log.op_type,
      target_type: log.target_type,
      target_id: log.target_id,
      desc: log.desc,
      old_data: log.old_data || null, 
      new_data: log.new_data || null,
    }

    try {
      this.db.prepare(`
        INSERT INTO operation_logs (op_type, target_type, target_id, desc, old_data, new_data)
        VALUES (@op_type, @target_type, @target_id, @desc, @old_data, @new_data)
      `).run(safeLog)

      this.db.exec(`DELETE FROM operation_logs WHERE id NOT IN (SELECT id FROM operation_logs ORDER BY id DESC LIMIT 1000)`)
    } catch (e) {
      console.error('日志写入失败:', e)
    }
  }

  public getLogs(): OperationLog[] {
    return this.db.prepare("SELECT * FROM operation_logs ORDER BY id DESC").all() as OperationLog[]
  }

  public undoOperation(logId: number) {
    const log = this.db.prepare("SELECT * FROM operation_logs WHERE id = ?").get(logId) as OperationLog
    if (!log) throw new Error('日志不存在')

    const undoTx = this.db.transaction(() => {
      const oldData = log.old_data ? JSON.parse(log.old_data) : null

      if (log.op_type === 'CREATE') {
        if (log.target_type === 'INVENTORY') {
          this.db.prepare("DELETE FROM inventory WHERE id = ?").run(log.target_id)
        } else if (log.target_type === 'PROJECT') {
          this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(log.target_id)
          this.db.prepare("DELETE FROM projects WHERE id = ?").run(log.target_id)
        }
      } 
      else if (log.op_type === 'DELETE') {
        if (log.target_type === 'INVENTORY') {
          this.db.prepare(`
            INSERT OR REPLACE INTO inventory (id, category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths)
            VALUES (@id, @category, @name, @value, @package, @quantity, @location, @min_stock, @image_paths, @datasheet_paths)
          `).run(oldData)
        } else if (log.target_type === 'PROJECT') {
          this.db.prepare(`
            INSERT OR REPLACE INTO projects (id, name, description, created_at, order_index, files)
            VALUES (@id, @name, @description, @created_at, @order_index, @files)
          `).run({ ...oldData.project, files: oldData.project.files || '[]' })
          
          const insertItem = this.db.prepare("INSERT INTO project_items (project_id, inventory_id, quantity) VALUES (?, ?, ?)")
          for (const item of oldData.items) {
            insertItem.run(oldData.project.id, item.inventory_id, item.quantity)
          }
        }
      }
      else if (log.op_type === 'UPDATE' || log.op_type === 'STOCK') {
        if (log.target_type === 'INVENTORY') {
          const exist = this.db.prepare("SELECT id FROM inventory WHERE id = ?").get(log.target_id)
          if (exist) {
            this.db.prepare(`
              UPDATE inventory 
              SET category=@category, name=@name, value=@value, package=@package, quantity=@quantity, location=@location, min_stock=@min_stock, image_paths=@image_paths, datasheet_paths=@datasheet_paths
              WHERE id=@id
            `).run(oldData)
          }
        } else if (log.target_type === 'PROJECT') {
          this.db.prepare("UPDATE projects SET name = ?, description = ?, files = ? WHERE id = ?")
            .run(oldData.project.name, oldData.project.description, oldData.project.files || '[]', log.target_id)
          
          this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(log.target_id)
          const insertItem = this.db.prepare("INSERT INTO project_items (project_id, inventory_id, quantity) VALUES (?, ?, ?)")
          for (const item of oldData.items) {
            insertItem.run(log.target_id, item.inventory_id, item.quantity)
          }
        }
      }

      this.db.prepare("DELETE FROM operation_logs WHERE id = ?").run(logId)
    })

    undoTx()
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

  public updateQty(id: number, qty: number) {
    this.assertPositiveInteger(id, 'id')
    this.assertNonNegativeInteger(qty, 'qty')

    const tx = this.db.transaction(() => {
      const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(id) as any
      if (!oldItem) throw new Error(`NOT_FOUND:inventory ${id}`)

      this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?").run(qty, id)

      // 使用 JSON 结构化日志
      this.addLog({
        op_type: 'STOCK',
        target_type: 'INVENTORY',
        target_id: id,
        desc: JSON.stringify({ 
          key: 'log.inventory.stock', 
          params: { name: oldItem.name, value: oldItem.value, old: oldItem.quantity, new: qty } 
        }),
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

      for (const { update, oldItem } of oldItems) {
        updateStmt.run(update.qty, update.id)
        this.addLog({
          op_type: 'STOCK',
          target_type: 'INVENTORY',
          target_id: update.id,
          desc: JSON.stringify({
            key: 'log.inventory.stock',
            params: {
              name: oldItem.name,
              value: oldItem.value,
              old: oldItem.quantity,
              new: update.qty
            }
          }),
          old_data: JSON.stringify(oldItem),
          new_data: JSON.stringify({ ...oldItem, quantity: update.qty })
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
        desc: JSON.stringify({
          key: 'log.inventory.delete',
          params: { name: oldItem.name, value: oldItem.value }
        }),
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

        this.addLog({
          op_type: 'UPDATE',
          target_type: 'INVENTORY',
          target_id: data.id,
          desc: JSON.stringify({
            key: 'log.inventory.update',
            params: { name: data.name, value: data.value }
          }),
          old_data: JSON.stringify(oldItem),
          new_data: JSON.stringify({ ...data, min_stock: minStock })
        })

      } else {
        const existing = this.db.prepare(`SELECT id, quantity FROM inventory WHERE category=? AND name=? AND value=? AND package=? AND location=?`).get(data.category, data.name, data.value, data.package, data.location) as any
        
        if (existing) {
           const newQty = existing.quantity + data.quantity
           this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?").run(newQty, existing.id)
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
             desc: JSON.stringify({
               key: 'log.inventory.create',
               params: { name: data.name, value: data.value }
             }),
             old_data: JSON.stringify(null),
             new_data: JSON.stringify({ ...data, id: newId, min_stock: minStock })
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

        this.addLog({
          op_type: 'UPDATE',
          target_type: 'PROJECT',
          target_id: pid,
          desc: JSON.stringify({
            key: 'log.project.update',
            params: { name: project.name }
          }),
          old_data: JSON.stringify(oldSnapshot),
          new_data: JSON.stringify({ project, items: project.items })
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

        this.addLog({
          op_type: 'CREATE',
          target_type: 'PROJECT',
          target_id: pid,
          desc: JSON.stringify({
            key: 'log.project.create',
            params: { name: project.name }
          }),
          old_data: undefined,
          new_data: JSON.stringify({ project: { ...project, id: pid }, items: project.items })
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
        desc: JSON.stringify({
          key: 'log.project.delete',
          params: { name: project.name }
        }),
        old_data: JSON.stringify(snapshot)
      })
    })
    tx()
  }

  public executeDeduction(items: DeductionItem[]) {
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
        if (oldItem.quantity < item.deductQty) {
          throw new Error(`INSUFFICIENT_STOCK:${JSON.stringify({
            id: item.id,
            available: oldItem.quantity,
            requested: item.deductQty
          })}`)
        }
        return { item, oldItem }
      })

      for (const { item, oldItem } of oldItems) {
        const newQty = oldItem.quantity - item.deductQty
        stmt.run(newQty, item.id)
        this.addLog({
          op_type: 'STOCK',
          target_type: 'INVENTORY',
          target_id: item.id,
          desc: JSON.stringify({
            key: 'log.inventory.deduct',
            params: { name: oldItem.name, qty: item.deductQty }
          }),
          old_data: JSON.stringify(oldItem),
          new_data: JSON.stringify({ ...oldItem, quantity: newQty })
        })
      }
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

  public saveCategoryRule(category: string, rule: CategoryRule) {
    this.db.prepare("INSERT OR REPLACE INTO category_rules (category, rule_json) VALUES (?, ?)").run(category, JSON.stringify(rule))
  }

  public resetCategoryRule(category: string) {
    this.db.prepare("DELETE FROM category_rules WHERE category = ?").run(category)
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

  public batchImportInventory(items: any[], mode: ImportStrategy) {
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
      SELECT id, quantity FROM inventory 
      WHERE category = ? AND name = ? AND value = ? AND package = ? AND location = ?
    `)

    const tx = this.db.transaction(() => {
      let successCount = 0
      let skipCount = 0

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
        ) as any

        if (exist) {
          if (mode === 'skip') {
            skipCount++
            continue
          } else if (mode === 'overwrite') {
            updateStmt.run({ ...safeItem, id: exist.id })
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
            insertStmt.run({ ...safeItem, name: candidate })
            successCount++
          }
        } else {
          insertStmt.run(safeItem)
          successCount++
        }
      }
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

  public saveAppSettings(settings: AppSettings) {
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
