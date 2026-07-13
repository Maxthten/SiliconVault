import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { MaintenanceManager } from '../../src/main/maintenance'
import { normalizeFilesystemPath } from '../../src/main/path-security'
import { createLocalResourceUrl, decodeLocalResourceUrl } from '../../src/shared/resource-url'
import { createTestDatabase, getInventoryId } from './helpers'

export async function testDatabaseCore(): Promise<void> {
  const testDb = createTestDatabase('database', true)
  const { manager, db, root } = testDb
  try {
    assert.ok(root.includes('中文 数据库目录 (测试) 📦'))
    assert.equal(normalizeFilesystemPath(root), path.resolve(root.normalize('NFC')))
    const complexRelativePath = '附件 空格/电阻%参数#版本📄.pdf'
    assert.equal(
      decodeLocalResourceUrl(createLocalResourceUrl(complexRelativePath)),
      complexRelativePath
    )
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)

    manager.upsert({
      category: '电阻',
      name: '数据库测试元件',
      value: '10kΩ',
      package: '0603',
      quantity: 8,
      location: '抽屉一',
      min_stock: 2
    })
    const id = getInventoryId(db, '数据库测试元件')
    assert.equal(manager.getInventoryHealthStats().total, 1)

    manager.updateQty(id, 1)
    assert.equal(manager.getInventoryHealthStats().lowStock, 1)

    assert.throws(
      () => manager.batchUpdateQty([
        { id, qty: 5 },
        { id: 999_999, qty: 1 }
      ]),
      /NOT_FOUND/
    )
    assert.equal(
      (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(id) as { quantity: number })
        .quantity,
      1
    )

    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    assert.deepEqual(integrity.map((row) => row.integrity_check), ['ok'])

    const assetsRoot = path.join(root, 'assets')
    const referencedAsset = path.join(assetsRoot, '引用', '存在.txt')
    const unusedAsset = path.join(assetsRoot, '临时', '未引用.txt')
    fs.mkdirSync(path.dirname(referencedAsset), { recursive: true })
    fs.mkdirSync(path.dirname(unusedAsset), { recursive: true })
    fs.writeFileSync(referencedAsset, 'referenced')
    fs.writeFileSync(unusedAsset, 'unused')
    db.prepare('UPDATE inventory SET image_paths = ?, datasheet_paths = ? WHERE id = ?').run(
      JSON.stringify(['引用/存在.txt', '引用/缺失.txt']),
      'not-json',
      id
    )

    const maintenance = new MaintenanceManager(manager)
    const scan = maintenance.scanUnusedAssets()
    assert.equal(scan.count, 1)
    assert.deepEqual(scan.missingReferencedFiles, ['引用/缺失.txt'])
    assert.equal(scan.invalidReferences, 1)
    const purge = maintenance.purgeAssets(['引用/存在.txt', '临时/未引用.txt'])
    assert.equal(purge.successCount, 1)
    assert.equal(purge.skippedReferenced, 1)
    assert.ok(purge.removedDirectories >= 1)
    assert.ok(fs.existsSync(referencedAsset))
    assert.ok(!fs.existsSync(unusedAsset))

    const diagnostics = maintenance.getMaintenanceDiagnostics()
    assert.equal(diagnostics.integrityCheck, 'ok')
    assert.equal(diagnostics.foreignKeyViolations, 0)
    const optimization = maintenance.optimizeDatabase()
    assert.equal(optimization.integrityCheck, 'ok')
  } finally {
    testDb.cleanup()
  }
}
