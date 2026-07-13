/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { normalizeFilesystemPath } from './path-security'
import type { RuntimeEnvironment } from '../shared/types'

const DEVELOPMENT_STORAGE_DIR = 'SiliconVaultdata'
const DEVELOPMENT_STORAGE_MARKER = '.development-storage'

export function isDevelopmentStorageMode(): boolean {
  return !app.isPackaged
}

export function getDevelopmentStoragePath(): string {
  return normalizeFilesystemPath(path.join(app.getAppPath(), DEVELOPMENT_STORAGE_DIR))
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

  const resolvedCandidate = normalizeFilesystemPath(candidatePath)
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
