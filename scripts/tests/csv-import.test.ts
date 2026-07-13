import assert from 'node:assert/strict'
import { createTestDatabase } from './helpers'

const csvItem = {
  category: 'CSV',
  name: 'CSV Test Part',
  value: '100nF',
  package: '0603',
  quantity: '4',
  location: 'C1',
  min_stock: '0'
}

export async function testCsvImport(): Promise<void> {
  const testDb = createTestDatabase('csv')
  const { manager, db } = testDb
  try {
    assert.deepEqual(manager.batchImportInventory([csvItem], 'overwrite'), {
      success: 1,
      skipped: 0
    })
    let stored = db.prepare('SELECT * FROM inventory WHERE name = ?').get(
      csvItem.name
    ) as { quantity: number; min_stock: number }
    assert.equal(stored.quantity, 4)
    assert.equal(stored.min_stock, 0)

    assert.deepEqual(manager.batchImportInventory([csvItem], 'skip'), {
      success: 0,
      skipped: 1
    })

    manager.batchImportInventory([{ ...csvItem, quantity: 9, min_stock: 2 }], 'overwrite')
    stored = db.prepare('SELECT * FROM inventory WHERE name = ?').get(
      csvItem.name
    ) as { quantity: number; min_stock: number }
    assert.equal(stored.quantity, 9)
    assert.equal(stored.min_stock, 2)

    manager.batchImportInventory([csvItem], 'keep_both')
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM inventory WHERE category = 'CSV'").get() as {
        count: number
      }).count,
      2
    )

    const importLogs = db.prepare(`
      SELECT details FROM operation_logs
      WHERE event_code = 'CSV_IMPORT'
      ORDER BY id DESC
    `).all() as Array<{ details: string }>
    assert.ok(importLogs.length >= 3)
    assert.equal(JSON.parse(importLogs[0].details).changes.length, 1)
  } finally {
    testDb.cleanup()
  }
}
