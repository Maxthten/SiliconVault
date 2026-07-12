import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DBManager } from '../src/main/db'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-phase1-'))
const manager = new DBManager(tempRoot)
const db = manager.getDb()

try {
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)

  manager.upsert({
    category: 'Test',
    name: 'Part A',
    value: '10k',
    package: '0603',
    quantity: 10,
    location: 'A1',
    min_stock: 0
  })
  manager.upsert({
    category: 'Test',
    name: 'Part B',
    value: '1uF',
    package: '0603',
    quantity: 5,
    location: 'A2',
    min_stock: 0
  })

  const [partA, partB] = db.prepare('SELECT * FROM inventory ORDER BY id ASC').all() as any[]
  assert.equal(partA.min_stock, 0)

  manager.saveProject({
    name: 'Dependency Project',
    description: '',
    items: [{ inventory_id: partA.id, quantity: 1 }]
  })
  assert.throws(() => manager.deleteItem(partA.id), /INVENTORY_IN_USE/)

  manager.deleteItem(partB.id)
  const deleteLog = db.prepare(`
    SELECT id FROM operation_logs
    WHERE op_type = 'DELETE' AND target_type = 'INVENTORY' AND target_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(partB.id) as { id: number }
  assert.ok(deleteLog)
  manager.undoOperation(deleteLog.id)
  assert.ok(db.prepare('SELECT id FROM inventory WHERE id = ?').get(partB.id))

  assert.throws(
    () => manager.batchUpdateQty([
      { id: partA.id, qty: 3 },
      { id: 999999, qty: 2 }
    ]),
    /NOT_FOUND/
  )
  assert.equal(
    (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA.id) as any).quantity,
    10
  )

  assert.throws(
    () => manager.executeDeduction([
      { id: partA.id, deductQty: 2 },
      { id: partB.id, deductQty: 999 }
    ]),
    /INSUFFICIENT_STOCK/
  )
  assert.equal(
    (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA.id) as any).quantity,
    10
  )

  manager.batchImportInventory([{
    category: 'CSV',
    name: 'Zero Threshold',
    value: '',
    package: 'SMD',
    quantity: 1,
    location: 'C1',
    min_stock: 0
  }], 'overwrite')
  const csvItem = db.prepare("SELECT * FROM inventory WHERE name = 'Zero Threshold'").get() as any
  assert.equal(csvItem.min_stock, 0)

  manager.batchImportInventory([{
    category: 'CSV',
    name: 'Zero Threshold',
    value: '',
    package: 'SMD',
    quantity: 2,
    location: 'C1',
    min_stock: 0
  }], 'keep_both')
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM inventory WHERE category = 'CSV'").get() as any).count,
    2
  )

  const allIds = (db.prepare('SELECT id FROM inventory ORDER BY id').all() as Array<{ id: number }>)
    .map(row => row.id)
  manager.updateSortOrder('inventory', [allIds[1]])
  const storedOrder = JSON.parse(
    (db.prepare("SELECT id_order FROM sort_orders WHERE table_name = 'inventory'").get() as any).id_order
  )
  assert.deepEqual(new Set(storedOrder), new Set(allIds))
  assert.equal(storedOrder[0], allIds[1])

  console.log('Phase 1 integration checks passed')
} finally {
  db.close()
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
