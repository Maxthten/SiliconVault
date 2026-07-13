import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { BackupManager } from '../../src/main/backup'
import { createTestDatabase, getInventoryId } from './helpers'

export async function testBackupImport(): Promise<void> {
  const source = createTestDatabase('backup-source', true)
  const destination = createTestDatabase('backup-destination', true)
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-backup-artifacts-'))
  try {
    const relativeAsset = '库存附件/中文资料.txt'
    const absoluteAsset = path.join(source.root, 'assets', ...relativeAsset.split('/'))
    fs.mkdirSync(path.dirname(absoluteAsset), { recursive: true })
    fs.writeFileSync(absoluteAsset, '中文附件内容', 'utf8')

    source.manager.upsert({
      category: '模块',
      name: '备份导入测试',
      value: 'V1',
      package: 'Module',
      quantity: 3,
      location: '备份区',
      min_stock: 1,
      image_paths: JSON.stringify([relativeAsset]),
      datasheet_paths: '[]'
    })
    const inventoryId = getInventoryId(source.db, '备份导入测试')
    source.manager.saveProject({
      name: '备份项目',
      description: '包含中文附件',
      items: [{ inventory_id: inventoryId, quantity: 1 }]
    })

    const bundlePath = path.join(artifacts, '中文业务资源包.svdata')
    const sourceBackup = new BackupManager(source.manager)
    const exportResult = await sourceBackup.exportBundle(bundlePath, { type: 'all' })
    assert.equal(exportResult.count.inventory, 1)
    assert.ok(fs.existsSync(bundlePath))

    const destinationBackup = new BackupManager(destination.manager)
    const scan = await destinationBackup.scanBundle(bundlePath)
    assert.equal(scan.meta.version, '3.0')
    assert.equal(scan.newItems.inventory, 1)
    assert.equal(scan.newItems.projects, 1)

    await destinationBackup.executeImport(scan.scanId, { inventory: {}, projects: {} })
    const imported = destination.db.prepare(
      'SELECT image_paths FROM inventory WHERE name = ?'
    ).get('备份导入测试') as { image_paths: string }
    const importedAsset = JSON.parse(imported.image_paths)[0] as string
    assert.ok(fs.existsSync(path.join(destination.root, 'assets', ...importedAsset.split('/'))))
    assert.equal(
      (destination.db.prepare('SELECT COUNT(*) AS count FROM project_items').get() as {
        count: number
      }).count,
      1
    )

    const fullBackupPath = path.join(artifacts, '完整应用备份.svbackup')
    await sourceBackup.createFullBackup(fullBackupPath)
    const fullBackupZip = new AdmZip(fullBackupPath)
    const manifest = JSON.parse(
      fullBackupZip.readAsText(fullBackupZip.getEntry('manifest.json')!)
    ) as { format: string; version: string }
    assert.equal(manifest.format, 'siliconvault-full-backup')
    assert.equal(manifest.version, '1.0')

    const malformedBundlePath = path.join(artifacts, '错误版本.svdata')
    const malformedZip = new AdmZip()
    malformedZip.addFile('meta.json', Buffer.from(JSON.stringify({
      format: 'siliconvault-business-bundle',
      kind: 'business-bundle',
      version: '99.0',
      createdAt: Date.now(),
      inventory: [],
      projects: [],
      projectItems: []
    })))
    malformedZip.writeZip(malformedBundlePath)
    await assert.rejects(
      () => destinationBackup.scanBundle(malformedBundlePath),
      /UNSUPPORTED_BUNDLE_VERSION/
    )
  } finally {
    source.cleanup()
    destination.cleanup()
    fs.rmSync(artifacts, { recursive: true, force: true })
  }
}
