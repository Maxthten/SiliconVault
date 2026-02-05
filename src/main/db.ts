import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import Store from 'electron-store'

// 初始化配置存储
const store = new Store()

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

export interface CategoryRule {
  nameLabel: string
  namePlaceholder: string
  valueLabel: string
  valuePlaceholder: string
  packageLabel: string
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

const DEFAULT_CATEGORIES = [
  "电阻", "电容", "电感", "二极管", "三极管", 
  "芯片(IC)", "连接器", "模块", "开关/按键", "其他"
]

const SYSTEM_DEFAULTS: Record<string, CategoryRule> = {
  '电阻': { nameLabel: '精度/功率', namePlaceholder: '选填 (如 1%)', valueLabel: '阻值', valuePlaceholder: '必填 (如 10k)', packageLabel: '封装' },
  '电容': { nameLabel: '耐压/材质', namePlaceholder: '选填 (如 50V)', valueLabel: '容值', valuePlaceholder: '必填 (如 100nF)', packageLabel: '封装' },
  '电感': { nameLabel: '电流/参数', namePlaceholder: '选填 (如 1A)', valueLabel: '感值', valuePlaceholder: '必填 (如 10uH)', packageLabel: '封装' },
  '芯片(IC)': { nameLabel: '完整型号', namePlaceholder: '必填 (如 STM32F103)', valueLabel: '核心描述', valuePlaceholder: '选填 (如 MCU)', packageLabel: '封装' },
  '二极管': { nameLabel: '参数', namePlaceholder: '如 75V', valueLabel: '型号', valuePlaceholder: '如 1N4148', packageLabel: '封装' },
  '三极管': { nameLabel: '参数', namePlaceholder: '如 NPN', valueLabel: '型号', valuePlaceholder: '如 S8050', packageLabel: '封装' }
}

const GENERIC_RULE: CategoryRule = {
  nameLabel: '型号/名称', namePlaceholder: '必填',
  valueLabel: '参数/数值', valuePlaceholder: '选填',
  packageLabel: '封装'
}

class DBManager {
  private db: Database.Database
  private userDataPath: string

  constructor() {
    const defaultPath = path.join(app.getPath('documents'), 'SiliconVault')
    this.userDataPath = (store.get('storagePath') as string) || defaultPath

    if (!fs.existsSync(this.userDataPath)) {
      try {
        fs.mkdirSync(this.userDataPath, { recursive: true })
      } catch (e) {
        console.error('创建数据目录失败，回退到临时目录', e)
        this.userDataPath = app.getPath('userData')
      }
    }

    const dbPath = path.join(this.userDataPath, 'inventory.db')
    this.db = new Database(dbPath)
    
    this.initTable()
    this.migrateSchema()
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
    if (category && category !== '全部分类') {
      sql += " AND category = ?"
      params.push(category)
    }
    sql += " ORDER BY package ASC"
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => r.package)
  }

  public fetchGrouped(filters: FilterOptions = {}): Record<string, InventoryItem[]> {
    let sql = "SELECT * FROM inventory WHERE 1=1"
    const params: any[] = []

    if (filters.keyword?.trim()) {
      sql += " AND (name LIKE ? OR value LIKE ? OR location LIKE ?)"
      const p = `%${filters.keyword}%`
      params.push(p, p, p)
    }
    if (filters.category && filters.category !== '全部分类') {
      sql += " AND category = ?"
      params.push(filters.category)
    }
    if (filters.package && filters.package !== '全部封装') {
      sql += " AND package = ?"
      params.push(filters.package)
    }

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
      const cat = row.category || "未分类"
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(row)
    }
    return grouped
  }

  public updateQty(id: number, qty: number) {
    const tx = this.db.transaction(() => {
      const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(id) as any
      if (!oldItem) return

      this.db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?").run(qty, id)

      this.addLog({
        op_type: 'STOCK',
        target_type: 'INVENTORY',
        target_id: id,
        desc: `库存变更: ${oldItem.name} ${oldItem.value || ''} (${oldItem.quantity} ➝ ${qty})`,
        old_data: JSON.stringify(oldItem),
        new_data: JSON.stringify({ ...oldItem, quantity: qty })
      })
    })
    tx()
  }

  public deleteItem(id: number) {
    try {
      // 尝试直接删除
      this.db.prepare('DELETE FROM inventory WHERE id = ?').run(id)
    } catch (error: any) {
      // 捕捉外键约束错误 (即：被占用了)
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        const projects = this.db.prepare(`
          SELECT p.name 
          FROM projects p
          JOIN project_items pi ON p.id = pi.project_id
          WHERE pi.inventory_id = ?
        `).all(id) as { name: string }[]

        // 提取名字并拼接，例如："智能小车", "机械臂"
        const names = projects.map(p => `"${p.name}"`).join(', ')
        
        // 抛出带有具体名单的错误信息
        throw new Error(`无法删除：该元件正在被以下项目使用：\n${names}\n请先在这些项目中移除该元件。`)
      }
      
      // 其他错误照常抛出
      throw error
    }
  }

  public upsert(data: InventoryItem) {
    const minStock = (data.min_stock !== undefined && data.min_stock !== null) ? data.min_stock : 10
    const imgPaths = data.image_paths || '[]'
    const docPaths = data.datasheet_paths || '[]'

    const tx = this.db.transaction(() => {
      if (data.id) {
        const oldItem = this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(data.id) as any
        
        this.db.prepare(`
          UPDATE inventory 
          SET category=@category, name=@name, value=@value, package=@package, quantity=@quantity, location=@location, min_stock=@min_stock, image_paths=@image_paths, datasheet_paths=@datasheet_paths
          WHERE id=@id
        `).run({ ...data, min_stock: minStock, image_paths: imgPaths, datasheet_paths: docPaths })

        this.addLog({
          op_type: 'UPDATE',
          target_type: 'INVENTORY',
          target_id: data.id,
          desc: `修改元件: ${data.name} ${data.value || ''}`,
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
             desc: `新增元件: ${data.name} ${data.value || ''}`,
             old_data: JSON.stringify(null),
             new_data: JSON.stringify({ ...data, id: newId, min_stock: minStock })
           })
        }
      }
    })
    tx()
  }

  public getProjects(query: string = ""): BomProject[] {
    let sql = "SELECT * FROM projects"
    const params: any[] = []
    
    if (query?.trim()) {
      sql += " WHERE name LIKE ? OR description LIKE ?"
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

  public getProjectDetail(projectId: number): BomItem[] {
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
    const tx = this.db.transaction(() => {
      let pid = project.id
      const filesJson = project.files || '[]'

      if (pid) {
        const oldProject = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(pid)
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
          desc: `修改项目: ${project.name}`,
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
          desc: `新建项目: ${project.name}`,
          old_data: undefined,
          new_data: JSON.stringify({ project: { ...project, id: pid }, items: project.items })
        })
      }
    })
    tx()
  }

  public deleteProject(id: number) {
    const tx = this.db.transaction(() => {
      const project = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any
      if (!project) return
      const items = this.db.prepare("SELECT * FROM project_items WHERE project_id = ?").all(id)
      const snapshot = { project, items }

      this.db.prepare("DELETE FROM project_items WHERE project_id = ?").run(id)
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(id)

      this.addLog({
        op_type: 'DELETE',
        target_type: 'PROJECT',
        target_id: id,
        desc: `删除项目: ${project.name}`,
        old_data: JSON.stringify(snapshot)
      })
    })
    tx()
  }

  public executeDeduction(items: { id: number, deductQty: number }[]) {
    const stmt = this.db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE id = ?")
    const getStmt = this.db.prepare("SELECT * FROM inventory WHERE id = ?")
    
    const tx = this.db.transaction(() => {
      for (const item of items) {
        const oldItem = getStmt.get(item.id) as any
        stmt.run(item.deductQty, item.id)
        
        if (oldItem) {
          this.addLog({
             op_type: 'STOCK',
             target_type: 'INVENTORY',
             target_id: item.id,
             desc: `生产扣减: ${oldItem.name} (-${item.deductQty})`,
             old_data: JSON.stringify(oldItem),
             new_data: JSON.stringify({ ...oldItem, quantity: oldItem.quantity - item.deductQty })
          })
        }
      }
    })
    tx()
  }

  public updateSortOrder(tableName: 'projects' | 'inventory', ids: number[]) {
    if (!['projects', 'inventory'].includes(tableName)) return
    
    try {
        this.db.exec(`CREATE TABLE IF NOT EXISTS sort_orders (table_name TEXT PRIMARY KEY, id_order TEXT)`)
    } catch(e) {}

    const stmt = this.db.prepare(`INSERT OR REPLACE INTO sort_orders (table_name, id_order) VALUES (?, ?)`)
    stmt.run(tableName, JSON.stringify(ids))
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

  public batchImportInventory(items: any[], mode: 'skip' | 'overwrite' | 'merge') {
    const insertStmt = this.db.prepare(`
      INSERT INTO inventory (category, name, value, package, quantity, location, min_stock, image_paths, datasheet_paths)
      VALUES (@category, @name, @value, @package, @quantity, @location, @min_stock, '[]', '[]')
    `)

    const updateStmt = this.db.prepare(`
      UPDATE inventory 
      SET category=@category, name=@name, value=@value, package=@package, quantity=@quantity, location=@location, min_stock=@min_stock
      WHERE id=@id
    `)

    const addQtyStmt = this.db.prepare(`
      UPDATE inventory SET quantity = quantity + ? WHERE id = ?
    `)

    const findStmt = this.db.prepare(`
      SELECT id, quantity FROM inventory 
      WHERE name = ? AND value = ? AND package = ?
    `)

    const tx = this.db.transaction(() => {
      let successCount = 0
      let skipCount = 0

      for (const item of items) {
        const safeItem = {
          category: item.category || '未分类',
          name: item.name || '未知元件',
          value: item.value || '',
          package: item.package || '',
          quantity: Number(item.quantity) || 0,
          location: item.location || '',
          min_stock: Number(item.min_stock) || 10
        }

        const exist = findStmt.get(safeItem.name, safeItem.value, safeItem.package) as any

        if (exist) {
          if (mode === 'skip') {
            skipCount++
            continue
          } 
          else if (mode === 'merge') {
            addQtyStmt.run(safeItem.quantity, exist.id)
            successCount++
          } 
          else if (mode === 'overwrite') {
            updateStmt.run({ ...safeItem, id: exist.id })
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
    const defaultBackupPath = path.join(app.getPath('documents'), 'SiliconVault', 'Backups')
    
    return {
      autoBackup: this.getSetting('autoBackup', false),
      backupFrequency: this.getSetting('backupFrequency', 'exit'),
      backupPath: this.getSetting('backupPath', defaultBackupPath),
      maxBackups: this.getSetting('maxBackups', 5)
    }
  }

  public saveAppSettings(settings: AppSettings) {
    const tx = this.db.transaction(() => {
      this.setSetting('autoBackup', settings.autoBackup)
      this.setSetting('backupFrequency', settings.backupFrequency)
      this.setSetting('backupPath', settings.backupPath)
      this.setSetting('maxBackups', settings.maxBackups)
    })
    tx()
  }
}

export const dbManager = new DBManager()