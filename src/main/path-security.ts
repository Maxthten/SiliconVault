/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs'
import path from 'path'

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const PORTABLE_INVALID_SEGMENT_CHARS = /[<>:"|?*]/

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter(character => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
}

export function sanitizePathSegment(value: unknown, fallback = 'unnamed'): string {
  const normalized = String(value || '').normalize('NFKC')
  const cleaned = removeControlCharacters(normalized)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)

  if (!cleaned || cleaned === '.' || cleaned === '..' || WINDOWS_RESERVED_NAMES.test(cleaned)) {
    return fallback
  }
  return cleaned
}

export function normalizeRelativePath(candidate: unknown): string {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('INVALID_PATH:relative path is required')
  }
  if (candidate.includes('\0')) throw new Error('INVALID_PATH:null byte')

  const decoded = candidate.replace(/\\/g, '/')
  if (/^[a-zA-Z]:/.test(decoded) || decoded.startsWith('/') || decoded.startsWith('//')) {
    throw new Error('INVALID_PATH:absolute paths are not allowed')
  }

  const normalized = path.posix.normalize(decoded)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.split('/').some(segment => segment === '..' || segment === '')
  ) {
    throw new Error('INVALID_PATH:path traversal is not allowed')
  }

  for (const segment of normalized.split('/')) {
    if (
      hasControlCharacter(segment) ||
      PORTABLE_INVALID_SEGMENT_CHARS.test(segment) ||
      /[. ]$/.test(segment) ||
      WINDOWS_RESERVED_NAMES.test(segment)
    ) {
      throw new Error('INVALID_PATH:path contains a non-portable segment')
    }
  }
  return normalized
}

export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveCanonicalPath(candidate: string): string {
  const resolved = path.resolve(candidate)
  const missingSegments: string[] = []
  let current = resolved

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('INVALID_PATH:no existing path ancestor')
    }
    missingSegments.unshift(path.basename(current))
    current = parent
  }

  const canonicalAncestor = fs.realpathSync(current)
  return path.resolve(canonicalAncestor, ...missingSegments)
}

export function normalizeFilesystemPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('INVALID_FILESYSTEM_PATH:path is required')
  }
  if (candidate.includes('\0')) throw new Error('INVALID_FILESYSTEM_PATH:null byte')
  return path.resolve(candidate.normalize('NFC'))
}

function assertExistingPathDoesNotEscape(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root)
  const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot

  let current = candidate
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  if (fs.existsSync(current)) {
    const realCurrent = fs.realpathSync(current)
    if (!isPathInside(realRoot, realCurrent)) {
      throw new Error('INVALID_PATH:symlink escapes allowed root')
    }
  }

  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate)
    if (!isPathInside(realRoot, realCandidate)) {
      throw new Error('INVALID_PATH:resolved path escapes allowed root')
    }
  }
}

export function resolvePathWithin(root: string, relativePath: unknown): string {
  const normalized = normalizeRelativePath(relativePath)
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...normalized.split('/'))
  if (!isPathInside(resolvedRoot, target) || target === resolvedRoot) {
    throw new Error('INVALID_PATH:path escapes allowed root')
  }
  assertExistingPathDoesNotEscape(resolvedRoot, target)
  return target
}

export function resolveExistingFileWithin(root: string, relativePath: unknown): string {
  const target = resolvePathWithin(root, relativePath)
  const stat = fs.statSync(target)
  if (!stat.isFile()) throw new Error('INVALID_PATH:target is not a file')
  return target
}

export function toPortableRelativePath(root: string, absolutePath: string): string {
  if (!isPathInside(root, absolutePath)) throw new Error('INVALID_PATH:path escapes allowed root')
  return normalizeRelativePath(path.relative(path.resolve(root), path.resolve(absolutePath)))
}

export function ensureDirectoryWithin(root: string, relativePath: string): string {
  const target = resolvePathWithin(root, relativePath)
  fs.mkdirSync(target, { recursive: true })
  assertExistingPathDoesNotEscape(root, target)
  return target
}

export function assertSafeAbsoluteDirectory(candidate: unknown): string {
  let resolved: string
  try {
    resolved = normalizeFilesystemPath(candidate)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.replace('INVALID_FILESYSTEM_PATH', 'INVALID_STORAGE_PATH'))
  }
  const parsed = path.parse(resolved)
  if (resolved === parsed.root) throw new Error('INVALID_STORAGE_PATH:filesystem root is not allowed')

  let current = resolved
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
    throw new Error('INVALID_STORAGE_PATH:parent directory is unavailable')
  }
  return resolved
}
