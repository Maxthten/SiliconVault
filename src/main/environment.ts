import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const DEVELOPMENT_STORAGE_DIR = 'SiliconVaultdata'
const DEVELOPMENT_STORAGE_MARKER = '.development-storage'

export interface RuntimeEnvironment {
  mode: 'development' | 'production'
  isDevelopment: boolean
  storagePathLocked: boolean
}

export function isDevelopmentStorageMode(): boolean {
  return !app.isPackaged
}

export function getDevelopmentStoragePath(): string {
  return path.resolve(app.getAppPath(), DEVELOPMENT_STORAGE_DIR)
}

export function ensureDevelopmentStoragePath(): string {
  const storagePath = getDevelopmentStoragePath()

  fs.mkdirSync(storagePath, { recursive: true })
  fs.mkdirSync(path.join(storagePath, 'assets'), { recursive: true })
  fs.mkdirSync(path.join(storagePath, 'Backups'), { recursive: true })

  const markerPath = path.join(storagePath, DEVELOPMENT_STORAGE_MARKER)
  if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(
      markerPath,
      [
        'SiliconVault Development Storage',
        'This directory is isolated from production data.',
        'Do not select this directory in a production build.'
      ].join('\n'),
      'utf-8'
    )
  }

  return storagePath
}

export function isDevelopmentStoragePath(candidatePath: string): boolean {
  if (!candidatePath) return false

  const resolvedCandidate = path.resolve(candidatePath)
  if (resolvedCandidate === getDevelopmentStoragePath()) return true
  if (path.basename(resolvedCandidate).toLowerCase() === DEVELOPMENT_STORAGE_DIR.toLowerCase()) {
    return true
  }

  return fs.existsSync(path.join(resolvedCandidate, DEVELOPMENT_STORAGE_MARKER))
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const isDevelopment = isDevelopmentStorageMode()

  return {
    mode: isDevelopment ? 'development' : 'production',
    isDevelopment,
    storagePathLocked: isDevelopment
  }
}
