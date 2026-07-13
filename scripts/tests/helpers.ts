import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { DBManager } from '../../src/main/db'

export interface TestDatabase {
  root: string
  manager: DBManager
  db: Database.Database
  cleanup: () => void
}

export function createTestDatabase(name: string, unicodeSubdirectory = false): TestDatabase {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `siliconvault-${name}-`))
  const root = unicodeSubdirectory
    ? path.join(tempRoot, '中文 数据库目录 (测试) 📦', '测试数据')
    : tempRoot
  fs.mkdirSync(root, { recursive: true })
  const manager = new DBManager(root)
  const db = manager.getDb()

  return {
    root,
    manager,
    db,
    cleanup: () => {
      if (db.open) db.close()
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }
}

export function getInventoryId(
  db: Database.Database,
  name: string
): number {
  const row = db.prepare('SELECT id FROM inventory WHERE name = ?').get(name) as
    | { id: number }
    | undefined
  if (!row) throw new Error(`Missing test inventory item: ${name}`)
  return row.id
}
