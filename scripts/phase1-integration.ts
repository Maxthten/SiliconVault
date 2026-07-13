import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import AdmZip from 'adm-zip'
import { DBManager } from '../src/main/db'
import { AnalyticsManager } from '../src/main/analytics'
import { BackupManager } from '../src/main/backup'
import { MaintenanceManager } from '../src/main/maintenance'
import { migrateStorageDirectory } from '../src/main/storage-migration'
import { ensureDevelopmentStoragePath } from '../src/main/environment'
import { createLocalResourceUrl, decodeLocalResourceUrl } from '../src/shared/resource-url'
import {
  normalizeRelativePath,
  resolveExistingFileWithin,
  resolvePathWithin,
  sanitizePathSegment
} from '../src/main/path-security'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-phase1-'))
const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-legacy-log-'))
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-artifacts-'))
const migrationParent = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-migration-test-'))
const unicodeWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-unicode-'))

async function run() {
  const manager = new DBManager(tempRoot)
  const db = manager.getDb()

  try {
  const originalTestAppPath = process.env.SILICONVAULT_TEST_APP_PATH
  const unicodeAppPath = path.join(unicodeWorkspace, '中文软件目录')
  fs.mkdirSync(unicodeAppPath, { recursive: true })
  process.env.SILICONVAULT_TEST_APP_PATH = unicodeAppPath
  const unicodeDevelopmentPath = ensureDevelopmentStoragePath()
  assert.equal(unicodeDevelopmentPath, path.join(unicodeAppPath, 'SiliconVaultdata'))
  assert.ok(fs.existsSync(path.join(unicodeDevelopmentPath, '.development-storage')))
  if (originalTestAppPath === undefined) {
    delete process.env.SILICONVAULT_TEST_APP_PATH
  } else {
    process.env.SILICONVAULT_TEST_APP_PATH = originalTestAppPath
  }

  const unicodeStoragePath = path.join(unicodeWorkspace, '数据库目录', '元器件资料')
  const unicodeManager = new DBManager(unicodeStoragePath)
  const unicodeDb = unicodeManager.getDb()
  unicodeManager.upsert({
    category: '电阻',
    name: '中文路径测试',
    value: '10kΩ',
    package: '0603',
    quantity: 3,
    location: '抽屉一',
    min_stock: 1
  })
  assert.equal(
    (unicodeDb.prepare('SELECT name FROM inventory LIMIT 1').get() as { name: string }).name,
    '中文路径测试'
  )
  const unicodeAssetRelativePath = '库存附件/电阻图片.png'
  const unicodeAssetPath = path.join(unicodeStoragePath, 'assets', ...unicodeAssetRelativePath.split('/'))
  fs.mkdirSync(path.dirname(unicodeAssetPath), { recursive: true })
  fs.writeFileSync(unicodeAssetPath, 'unicode asset')
  const unicodeResourceUrl = createLocalResourceUrl(unicodeAssetRelativePath)
  assert.equal(decodeLocalResourceUrl(unicodeResourceUrl), unicodeAssetRelativePath)
  assert.equal(
    resolveExistingFileWithin(path.join(unicodeStoragePath, 'assets'), decodeLocalResourceUrl(unicodeResourceUrl)),
    unicodeAssetPath
  )
  const unicodeMigrationTarget = path.join(unicodeWorkspace, '迁移目标', '独立数据库')
  fs.mkdirSync(unicodeMigrationTarget, { recursive: true })
  const unicodeMigration = await migrateStorageDirectory(
    unicodeDb,
    unicodeStoragePath,
    unicodeMigrationTarget
  )
  assert.equal(unicodeMigration.integrityCheck, 'ok')
  assert.ok(fs.existsSync(path.join(unicodeMigrationTarget, 'inventory.db')))
  assert.ok(fs.existsSync(path.join(unicodeMigrationTarget, 'assets', '库存附件', '电阻图片.png')))
  unicodeDb.close()

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
  assert.ok(
    (db.prepare('SELECT undone_at FROM operation_logs WHERE id = ?').get(deleteLog.id) as any).undone_at
  )

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

  manager.updateQty(partA.id, 7)
  manager.updateQty(partA.id, 10)
  const manualEvents = db.prepare(`
    SELECT event_code FROM operation_logs
    WHERE event_code IN ('INVENTORY_MANUAL_IN', 'INVENTORY_MANUAL_OUT')
    ORDER BY id DESC LIMIT 2
  `).all() as Array<{ event_code: string }>
  assert.deepEqual(
    new Set(manualEvents.map(log => log.event_code)),
    new Set(['INVENTORY_MANUAL_IN', 'INVENTORY_MANUAL_OUT'])
  )

  manager.batchUpdateQty([{ id: partA.id, qty: 9 }])
  const singleBatchLog = db.prepare(`
    SELECT * FROM operation_logs
    WHERE target_id = ? AND event_code = 'INVENTORY_MANUAL_OUT'
    ORDER BY id DESC LIMIT 1
  `).get(partA.id) as any
  assert.ok(singleBatchLog)
  assert.equal(JSON.parse(singleBatchLog.details).items.length, 1)
  manager.undoOperation(singleBatchLog.id)
  assert.equal(
    (db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(partA.id) as any).quantity,
    10
  )

  const batchLogCountBefore = (db.prepare(`
    SELECT COUNT(*) AS count FROM operation_logs
    WHERE event_code = 'INVENTORY_BATCH_ADJUST'
  `).get() as any).count
  manager.batchUpdateQty([
    { id: partA.id, qty: 8 },
    { id: partB.id, qty: 4 }
  ])
  const batchLogs = db.prepare(`
    SELECT * FROM operation_logs
    WHERE event_code = 'INVENTORY_BATCH_ADJUST'
    ORDER BY id DESC
  `).all() as any[]
  assert.equal(batchLogs.length, batchLogCountBefore + 1)
  assert.equal(JSON.parse(batchLogs[0].details).items.length, 2)

  manager.executeDeduction([
    { id: partA.id, deductQty: 2 },
    { id: partB.id, deductQty: 1 }
  ], {
    projectId: 1,
    projectName: 'Dependency Project',
    productionQuantity: 1
  })
  const bomLogs = db.prepare(`
    SELECT * FROM operation_logs
    WHERE event_code = 'BOM_PRODUCTION_DEDUCTION'
    ORDER BY id DESC
  `).all() as any[]
  assert.equal(bomLogs.length, 1)
  assert.equal(JSON.parse(bomLogs[0].details).items.length, 2)

  const analytics = new AnalyticsManager(manager)
  assert.equal(analytics.getConsumptionStats('day').summary.totalQuantity, 9)

  manager.undoOperation(batchLogs[0].id)
  assert.equal(analytics.getConsumptionStats('day').summary.totalQuantity, 6)
  manager.undoOperation(bomLogs[0].id)
  assert.equal(analytics.getConsumptionStats('day').summary.totalQuantity, 3)

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
    quantity: 9,
    location: 'C1',
    min_stock: 2
  }], 'overwrite')
  const overwriteLog = db.prepare(`
    SELECT * FROM operation_logs
    WHERE event_code = 'CSV_IMPORT'
    ORDER BY id DESC LIMIT 1
  `).get() as any
  assert.equal(
    (db.prepare("SELECT quantity FROM inventory WHERE name = 'Zero Threshold'").get() as any).quantity,
    9
  )
  manager.undoOperation(overwriteLog.id)
  assert.equal(
    (db.prepare("SELECT quantity FROM inventory WHERE name = 'Zero Threshold'").get() as any).quantity,
    1
  )

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
  const csvLog = db.prepare(`
    SELECT * FROM operation_logs
    WHERE event_code = 'CSV_IMPORT'
    ORDER BY id DESC LIMIT 1
  `).get() as any
  assert.equal(JSON.parse(csvLog.details).changes.length, 1)
  manager.undoOperation(csvLog.id)
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM inventory WHERE category = 'CSV'").get() as any).count,
    1
  )

  const allIds = (db.prepare('SELECT id FROM inventory ORDER BY id').all() as Array<{ id: number }>)
    .map(row => row.id)
  manager.updateSortOrder('inventory', [allIds[1]])
  const storedOrder = JSON.parse(
    (db.prepare("SELECT id_order FROM sort_orders WHERE table_name = 'inventory'").get() as any).id_order
  )
  assert.deepEqual(new Set(storedOrder), new Set(allIds))
  assert.equal(storedOrder[0], allIds[1])

  const assetsRoot = path.join(tempRoot, 'assets')
  fs.mkdirSync(path.join(assetsRoot, 'a'), { recursive: true })
  fs.mkdirSync(path.join(assetsRoot, 'b'), { recursive: true })
  fs.writeFileSync(path.join(assetsRoot, 'a', 'same.txt'), 'referenced')
  fs.writeFileSync(path.join(assetsRoot, 'b', 'same.txt'), 'unused')
  db.prepare("UPDATE inventory SET image_paths = ? WHERE id = ?")
    .run(JSON.stringify(['a/same.txt']), partA.id)

  assert.equal(normalizeRelativePath('a\\same.txt'), 'a/same.txt')
  assert.equal(sanitizePathSegment('../bad:name'), '.._bad_name')
  assert.throws(() => normalizeRelativePath('assets/file.txt:stream'), /INVALID_PATH/)
  assert.throws(() => normalizeRelativePath('assets/CON.txt'), /INVALID_PATH/)
  assert.throws(() => normalizeRelativePath('assets/trailing.'), /INVALID_PATH/)
  assert.equal(
    resolveExistingFileWithin(assetsRoot, 'a/same.txt'),
    path.join(assetsRoot, 'a', 'same.txt')
  )
  assert.throws(() => resolvePathWithin(assetsRoot, '../inventory.db'), /INVALID_PATH/)
  assert.throws(() => resolvePathWithin(assetsRoot, path.join(tempRoot, 'inventory.db')), /INVALID_PATH/)

  const maintenance = new MaintenanceManager(manager)
  const unusedScan = maintenance.scanUnusedAssets()
  assert.ok(unusedScan.items.some(item => item.relativePath === 'b/same.txt'))
  assert.ok(!unusedScan.items.some(item => item.relativePath === 'a/same.txt'))
  const purgeResult = maintenance.purgeAssets(['../inventory.db', 'a/same.txt', 'b/same.txt'])
  assert.equal(purgeResult.successCount, 1)
  assert.equal(purgeResult.failCount, 2)
  assert.ok(fs.existsSync(path.join(assetsRoot, 'a', 'same.txt')))
  assert.ok(!fs.existsSync(path.join(assetsRoot, 'b', 'same.txt')))

  const backupManager = new BackupManager(manager)
  assert.throws(
    () => backupManager.validateBackupDirectory(path.join(tempRoot, 'assets', 'backups')),
    /BACKUP_PATH_INSIDE_ASSETS/
  )
  assert.throws(
    () => manager.saveAppSettings({
      autoBackup: true,
      backupFrequency: '1h',
      backupPath: artifactRoot,
      maxBackups: 0
    }),
    /INVALID_BACKUP_SETTINGS/
  )
  const businessBundlePath = path.join(artifactRoot, 'business.svdata')
  await backupManager.exportBundle(businessBundlePath, { type: 'all' })
  const businessZip = new AdmZip(businessBundlePath)
  const businessMeta = JSON.parse(businessZip.readAsText('meta.json'))
  assert.equal(businessMeta.format, 'siliconvault-business-bundle')
  assert.equal(businessMeta.kind, 'business-bundle')
  assert.equal(businessMeta.version, '3.0')
  assert.ok(businessZip.getEntry('assets/a/same.txt'))

  const fullBackupPath = path.join(artifactRoot, 'complete.svbackup')
  await backupManager.createFullBackup(fullBackupPath)
  const fullBackupZip = new AdmZip(fullBackupPath)
  const fullManifest = JSON.parse(fullBackupZip.readAsText('manifest.json'))
  assert.equal(fullManifest.format, 'siliconvault-full-backup')
  assert.equal(fullManifest.kind, 'full-application-backup')
  assert.ok(fullBackupZip.getEntry('database/inventory.db'))
  assert.ok(fullBackupZip.getEntry('assets/a/same.txt'))
  await backupManager.createFullBackup(fullBackupPath)
  assert.equal(
    JSON.parse(new AdmZip(fullBackupPath).readAsText('manifest.json')).format,
    'siliconvault-full-backup'
  )

  const unsupportedBundlePath = path.join(artifactRoot, 'unsupported.svdata')
  const unsupportedZip = new AdmZip()
  unsupportedZip.addFile('meta.json', Buffer.from(JSON.stringify({
    format: 'siliconvault-business-bundle',
    kind: 'business-bundle',
    version: '99.0',
    createdAt: Date.now(),
    inventory: [],
    projects: [],
    projectItems: []
  })))
  unsupportedZip.writeZip(unsupportedBundlePath)
  await assert.rejects(
    () => backupManager.scanBundle(unsupportedBundlePath),
    /UNSUPPORTED_BUNDLE_VERSION/
  )

  const unsafeBundlePath = path.join(artifactRoot, 'unsafe.svdata')
  const unsafeZip = new AdmZip()
  unsafeZip.addFile('meta.json', Buffer.from(JSON.stringify({
    format: 'siliconvault-business-bundle',
    kind: 'business-bundle',
    version: '3.0',
    createdAt: Date.now(),
    inventory: [{
      id: 1,
      category: 'Test',
      name: 'Unsafe',
      value: '',
      package: '',
      quantity: 0,
      location: '',
      min_stock: 0,
      image_paths: JSON.stringify(['../escape.txt']),
      datasheet_paths: '[]'
    }],
    projects: [],
    projectItems: []
  })))
  unsafeZip.writeZip(unsafeBundlePath)
  await assert.rejects(() => backupManager.scanBundle(unsafeBundlePath), /INVALID_PATH/)
  assert.ok(!fs.existsSync(path.join(artifactRoot, 'escape.txt')))

  const malformedPathListBundlePath = path.join(artifactRoot, 'malformed-path-list.svdata')
  const malformedPathListZip = new AdmZip()
  malformedPathListZip.addFile('meta.json', Buffer.from(JSON.stringify({
    format: 'siliconvault-business-bundle',
    kind: 'business-bundle',
    version: '3.0',
    createdAt: Date.now(),
    inventory: [{
      id: 1,
      category: 'Test',
      name: 'Malformed',
      value: '',
      package: '',
      quantity: 0,
      location: '',
      min_stock: 0,
      image_paths: 'not-json',
      datasheet_paths: '[]'
    }],
    projects: [],
    projectItems: []
  })))
  malformedPathListZip.writeZip(malformedPathListBundlePath)
  await assert.rejects(
    () => backupManager.scanBundle(malformedPathListBundlePath),
    /INVALID_BUNDLE_FIELD:inventory.image_paths/
  )

  const scanResult = await backupManager.scanBundle(businessBundlePath)
  const inventoryStrategies: Record<number, 'keep_both'> = {}
  const projectStrategies: Record<number, 'keep_both'> = {}
  for (const conflict of scanResult.conflicts.inventory) {
    inventoryStrategies[conflict.remote.id] = 'keep_both'
  }
  for (const conflict of scanResult.conflicts.projects) {
    projectStrategies[conflict.remote.id] = 'keep_both'
  }
  await backupManager.executeImport(scanResult.scanId, {
    inventory: inventoryStrategies,
    projects: projectStrategies
  })
  const importedPart = db.prepare(
    "SELECT * FROM inventory WHERE name LIKE 'Part A (Imported)%' ORDER BY id DESC LIMIT 1"
  ).get() as any
  assert.ok(importedPart)
  const importedPaths = JSON.parse(importedPart.image_paths)
  assert.equal(importedPaths.length, 1)
  assert.ok(resolveExistingFileWithin(assetsRoot, importedPaths[0]))
  assert.ok(!fs.existsSync(path.join(tempRoot, '.staging', 'imports', scanResult.scanId)))

  const staleStage = path.join(tempRoot, '.staging', 'imports', 'stale-session')
  fs.mkdirSync(staleStage, { recursive: true })
  const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  fs.utimesSync(staleStage, oldTime, oldTime)
  backupManager.cleanupExpiredImportDirectories()
  assert.ok(!fs.existsSync(staleStage))

  const nonEmptyTarget = path.join(migrationParent, 'non-empty')
  fs.mkdirSync(nonEmptyTarget)
  fs.writeFileSync(path.join(nonEmptyTarget, 'existing.txt'), 'occupied')
  await assert.rejects(
    () => migrateStorageDirectory(db, tempRoot, nonEmptyTarget),
    /STORAGE_MIGRATION_TARGET_NOT_EMPTY/
  )

  const linkedSource = path.join(migrationParent, 'linked-source')
  try {
    fs.symlinkSync(tempRoot, linkedSource, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(
      () => migrateStorageDirectory(db, tempRoot, path.join(linkedSource, 'nested-target')),
      /STORAGE_MIGRATION_NESTED_PATH/
    )
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(code)) throw error
  } finally {
    if (fs.existsSync(linkedSource)) fs.rmSync(linkedSource, { recursive: true, force: true })
  }

  const migratedTarget = path.join(migrationParent, 'migrated-storage')
  fs.mkdirSync(migratedTarget)
  const migrationResult = await migrateStorageDirectory(db, tempRoot, migratedTarget)
  assert.equal(migrationResult.integrityCheck, 'ok')
  assert.ok(fs.existsSync(path.join(migratedTarget, 'inventory.db')))
  assert.ok(fs.existsSync(path.join(migratedTarget, 'assets', 'a', 'same.txt')))
  assert.ok(fs.existsSync(path.join(migratedTarget, 'storage-manifest.json')))

  const legacyDb = new Database(path.join(legacyRoot, 'inventory.db'))
  legacyDb.exec(`
    CREATE TABLE operation_logs (
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
  legacyDb.prepare(`
    INSERT INTO operation_logs (op_type, target_type, target_id, desc, old_data, new_data)
    VALUES ('STOCK', 'INVENTORY', 1, ?, ?, ?)
  `).run(
    JSON.stringify({ key: 'log.inventory.stock', params: {} }),
    JSON.stringify({ id: 1, quantity: 10 }),
    JSON.stringify({ id: 1, quantity: 8 })
  )
  legacyDb.close()
  const migratedManager = new DBManager(legacyRoot)
  const migratedDb = migratedManager.getDb()
  const migratedLog = migratedDb.prepare('SELECT * FROM operation_logs LIMIT 1').get() as any
  assert.equal(migratedLog.event_code, 'INVENTORY_MANUAL_OUT')
  assert.equal(migratedLog.undoable, 1)
  migratedDb.close()

    console.log('SiliconVault integration checks passed')
  } finally {
    db.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(legacyRoot, { recursive: true, force: true })
    fs.rmSync(artifactRoot, { recursive: true, force: true })
    fs.rmSync(migrationParent, { recursive: true, force: true })
    fs.rmSync(unicodeWorkspace, { recursive: true, force: true })
  }
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
