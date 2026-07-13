import { testBackupImport } from './tests/backup-import.test'
import { testBomDeduction } from './tests/bom-deduction.test'
import { testCategoryLayout } from './tests/category-layout.test'
import { testCsvImport } from './tests/csv-import.test'
import { testDatabaseCore } from './tests/database.test'

async function run(): Promise<void> {
  testCategoryLayout()
  await testDatabaseCore()
  await testBomDeduction()
  await testCsvImport()
  await testBackupImport()
  console.log('SiliconVault quality integration checks passed')
}

run().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
