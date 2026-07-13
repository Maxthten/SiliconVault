/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  assertSafeAbsoluteDirectory,
  isPathInside,
  resolveCanonicalPath,
  resolvePathWithin,
  sanitizePathSegment
} from './path-security'
import type { StorageMigrationResult } from '../shared/types'

const STORAGE_MANIFEST_FORMAT = 'siliconvault-storage'
const STORAGE_MANIFEST_VERSION = '1.0'

export async function migrateStorageDirectory(
  database: Database.Database,
  currentPath: string,
  requestedPath: unknown
): Promise<StorageMigrationResult> {
  const sourcePath = path.resolve(currentPath)
  const targetPath = assertSafeAbsoluteDirectory(requestedPath)
  const canonicalSourcePath = resolveCanonicalPath(sourcePath)
  const canonicalTargetPath = resolveCanonicalPath(targetPath)
  if (pathsEqual(sourcePath, targetPath) || pathsEqual(canonicalSourcePath, canonicalTargetPath)) {
    throw new Error('STORAGE_MIGRATION_SAME_PATH')
  }
  if (
    isPathInside(sourcePath, targetPath) ||
    isPathInside(targetPath, sourcePath) ||
    isPathInside(canonicalSourcePath, canonicalTargetPath) ||
    isPathInside(canonicalTargetPath, canonicalSourcePath)
  ) {
    throw new Error('STORAGE_MIGRATION_NESTED_PATH')
  }
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error('STORAGE_MIGRATION_SOURCE_MISSING')
  }
  if (!fs.existsSync(path.join(sourcePath, 'inventory.db'))) {
    throw new Error('STORAGE_MIGRATION_DATABASE_MISSING')
  }

  const targetParent = path.dirname(targetPath)
  fs.mkdirSync(targetParent, { recursive: true })
  assertDirectoryWritable(targetParent)

  if (fs.existsSync(targetPath)) {
    if (fs.lstatSync(targetPath).isSymbolicLink()) {
      throw new Error('STORAGE_MIGRATION_SYMLINK_NOT_ALLOWED')
    }
    if (!fs.statSync(targetPath).isDirectory()) throw new Error('STORAGE_MIGRATION_TARGET_NOT_DIRECTORY')
    if (fs.readdirSync(targetPath).length > 0) throw new Error('STORAGE_MIGRATION_TARGET_NOT_EMPTY')
  }

  const requiredBytes = calculateDirectorySize(sourcePath)
  assertEnoughDiskSpace(targetParent, requiredBytes)

  const stageName = `.${sanitizePathSegment(path.basename(targetPath), 'SiliconVault')}.migration-${randomUUID()}`
  const stagePath = path.join(targetParent, stageName)
  fs.mkdirSync(stagePath, { recursive: false })

  try {
    const stagedDatabasePath = path.join(stagePath, 'inventory.db')
    await database.backup(stagedDatabasePath)
    copyStorageContents(sourcePath, stagePath)

    fs.writeFileSync(
      path.join(stagePath, 'storage-manifest.json'),
      JSON.stringify({
        format: STORAGE_MANIFEST_FORMAT,
        version: STORAGE_MANIFEST_VERSION,
        migratedAt: Date.now()
      }, null, 2),
      { encoding: 'utf8', flag: 'wx' }
    )

    validateDatabaseSnapshot(stagedDatabasePath)
    const copiedBytes = calculateDirectorySize(stagePath)

    if (fs.existsSync(targetPath)) fs.rmdirSync(targetPath)
    fs.renameSync(stagePath, targetPath)
    return { targetPath, copiedBytes, integrityCheck: 'ok' }
  } catch (error) {
    if (fs.existsSync(stagePath)) fs.rmSync(stagePath, { recursive: true, force: true })
    throw error
  }
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function assertDirectoryWritable(directory: string): void {
  const probePath = path.join(directory, `.siliconvault-write-test-${randomUUID()}`)
  try {
    fs.writeFileSync(probePath, 'ok', { flag: 'wx' })
  } finally {
    if (fs.existsSync(probePath)) fs.rmSync(probePath, { force: true })
  }
}

function assertEnoughDiskSpace(directory: string, requiredBytes: number): void {
  const stat = fs.statfsSync(directory)
  const availableBytes = Number(stat.bavail) * Number(stat.bsize)
  const safetyMargin = Math.max(100 * 1024 * 1024, Math.ceil(requiredBytes * 0.1))
  if (availableBytes < requiredBytes + safetyMargin) {
    throw new Error('STORAGE_MIGRATION_INSUFFICIENT_SPACE')
  }
}

function calculateDirectorySize(root: string): number {
  let total = 0
  const traverse = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) traverse(absolutePath)
      else if (entry.isFile()) total += fs.statSync(absolutePath).size
    }
  }
  traverse(root)
  return total
}

function copyStorageContents(sourceRoot: string, targetRoot: string): void {
  const copyDirectory = (sourceDirectory: string, targetDirectory: string): void => {
    fs.mkdirSync(targetDirectory, { recursive: true })
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
      if (
        sourceDirectory === sourceRoot &&
        ['inventory.db', 'inventory.db-wal', 'inventory.db-shm', '.staging', 'storage-manifest.json'].includes(entry.name)
      ) {
        continue
      }
      if (entry.isSymbolicLink()) throw new Error('STORAGE_MIGRATION_SYMLINK_NOT_ALLOWED')

      const sourcePath = path.join(sourceDirectory, entry.name)
      const relativePath = path.relative(sourceRoot, sourcePath).replace(/\\/g, '/')
      const targetPath = resolvePathWithin(targetRoot, relativePath)
      if (entry.isDirectory()) {
        copyDirectory(sourcePath, targetPath)
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
      }
    }
  }
  copyDirectory(sourceRoot, targetRoot)
}

function validateDatabaseSnapshot(databasePath: string): void {
  const snapshot = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = snapshot.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`STORAGE_MIGRATION_INTEGRITY_FAILED:${String(integrity)}`)
    const foreignKeyErrors = snapshot.pragma('foreign_key_check') as unknown[]
    if (foreignKeyErrors.length > 0) throw new Error('STORAGE_MIGRATION_FOREIGN_KEY_FAILED')
  } finally {
    snapshot.close()
  }
}
