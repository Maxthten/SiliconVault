const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const unicodeLink = path.join(path.dirname(projectRoot), '中文 软件路径 (构建测试) 📦')

if (fs.existsSync(unicodeLink)) {
  throw new Error(`Unicode build test path already exists: ${unicodeLink}`)
}

fs.symlinkSync(projectRoot, unicodeLink, process.platform === 'win32' ? 'junction' : 'dir')
let cleanupError
try {
  const electronVitePackage = require.resolve('electron-vite/package.json')
  const electronViteCli = path.join(path.dirname(electronVitePackage), 'bin', 'electron-vite.js')
  const result = spawnSync(process.execPath, [electronViteCli, 'build'], {
    cwd: unicodeLink,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Unicode-path build failed with exit code ${result.status}`)
  }
} finally {
  if (fs.existsSync(unicodeLink)) {
    const stat = fs.lstatSync(unicodeLink)
    const resolvedTarget = fs.realpathSync(unicodeLink)
    if (!stat.isSymbolicLink() || resolvedTarget !== fs.realpathSync(projectRoot)) {
      cleanupError = new Error(`Refusing to remove unexpected unicode test path: ${unicodeLink}`)
    } else {
      fs.unlinkSync(unicodeLink)
    }
  }
}

if (cleanupError) throw cleanupError
