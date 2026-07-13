import assert from 'node:assert/strict'
import { createTestDatabase, getInventoryId } from './helpers'

export async function testBomDeduction(): Promise<void> {
  const testDb = createTestDatabase('bom')
  const { manager, db } = testDb
  try {
    manager.upsert({
      category: 'Resistor',
      name: 'BOM Part A',
      value: '10k',
      package: '0603',
      quantity: 10,
      location: 'A1',
      min_stock: 1
    })
    manager.upsert({
      category: 'Capacitor',
      name: 'BOM Part B',
      value: '1uF',
      package: '0603',
      quantity: 6,
      location: 'A2',
      min_stock: 1
    })
    const partA = getInventoryId(db, 'BOM Part A')
    const partB = getInventoryId(db, 'BOM Part B')

    manager.saveProject({
      name: 'BOM Test Project',
      description: 'Atomic deduction test',
      items: [
        { inventory_id: partA, quantity: 2 },
        { inventory_id: partB, quantity: 1 }
      ]
    })
    const project = db.prepare('SELECT id FROM projects WHERE name = ?').get(
      'BOM Test Project'
    ) as { id: number }

    manager.executeDeduction(
      [
        { id: partA, deductQty: 4 },
        { id: partB, deductQty: 2 }
      ],
      { projectId: project.id, projectName: 'BOM Test Project', productionQuantity: 2 }
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA) as { quantity: number })
        .quantity,
      6
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partB) as { quantity: number })
        .quantity,
      4
    )

    const log = db.prepare(`
      SELECT id, details FROM operation_logs
      WHERE event_code = 'BOM_PRODUCTION_DEDUCTION'
      ORDER BY id DESC LIMIT 1
    `).get() as { id: number; details: string }
    assert.equal(JSON.parse(log.details).items.length, 2)

    const beforeFailedDeduction = db.prepare(
      'SELECT id, quantity FROM inventory ORDER BY id'
    ).all()
    assert.throws(
      () => manager.executeDeduction([
        { id: partA, deductQty: 1 },
        { id: partB, deductQty: 999 }
      ]),
      /INSUFFICIENT_STOCK/
    )
    assert.deepEqual(
      db.prepare('SELECT id, quantity FROM inventory ORDER BY id').all(),
      beforeFailedDeduction
    )

    const deductionLogCountBeforeForce = (
      db.prepare(`
        SELECT COUNT(*) AS count FROM operation_logs
        WHERE event_code = 'BOM_PRODUCTION_DEDUCTION'
      `).get() as { count: number }
    ).count

    manager.executeDeduction(
      [
        { id: partA, deductQty: 8 },
        { id: partB, deductQty: 1 }
      ],
      {
        projectId: project.id,
        projectName: 'BOM Test Project',
        productionQuantity: 4,
        allowNegative: true
      }
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA) as { quantity: number })
        .quantity,
      -2
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partB) as { quantity: number })
        .quantity,
      3
    )

    const forcedLog = db.prepare(`
      SELECT id, details FROM operation_logs
      WHERE event_code = 'BOM_PRODUCTION_DEDUCTION'
      ORDER BY id DESC LIMIT 1
    `).get() as { id: number; details: string }
    const forcedDetails = JSON.parse(forcedLog.details) as {
      items: Array<{ inventory_id: number; before: number; after: number; delta: number }>
    }
    assert.equal(forcedDetails.items.length, 2)
    assert.deepEqual(
      forcedDetails.items.find(item => item.inventory_id === partA),
      {
        inventory_id: partA,
        name: 'BOM Part A',
        value: '10k',
        category: 'Resistor',
        package: '0603',
        before: 6,
        after: -2,
        delta: -8
      }
    )
    assert.equal(
      (
        db.prepare(`
          SELECT COUNT(*) AS count FROM operation_logs
          WHERE event_code = 'BOM_PRODUCTION_DEDUCTION'
        `).get() as { count: number }
      ).count,
      deductionLogCountBeforeForce + 1
    )

    manager.undoOperation(forcedLog.id)
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA) as { quantity: number })
        .quantity,
      6
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partB) as { quantity: number })
        .quantity,
      4
    )

    manager.undoOperation(log.id)
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA) as { quantity: number })
        .quantity,
      10
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partB) as { quantity: number })
        .quantity,
      6
    )
  } finally {
    testDb.cleanup()
  }
}
