const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const esbuild = require('esbuild')

const projectRoot = path.resolve(__dirname, '..')
const bundlePath = path.join(__dirname, '.phase1-integration.cjs')
const singletonRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'siliconvault-singleton-'))

try {
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'phase1-integration.ts')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['better-sqlite3'],
    alias: {
      electron: path.join(__dirname, 'test-stubs', 'electron.ts'),
      'electron-store': path.join(__dirname, 'test-stubs', 'electron-store.ts')
    }
  })

  const electronPath = require('electron')
  const result = spawnSync(electronPath, [bundlePath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SILICONVAULT_TEST_APP_PATH: singletonRoot
    },
    stdio: 'inherit'
  })

  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  fs.rmSync(bundlePath, { force: true })
  fs.rmSync(singletonRoot, { recursive: true, force: true })
}
