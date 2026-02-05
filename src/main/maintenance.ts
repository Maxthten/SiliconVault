import fs from 'fs'
import path from 'path'
import { dbManager } from './db'

export interface UnusedAsset {
  name: string
  relativePath: string
  size: number
  mtime: number // 修改时间
}

export interface ScanResult {
  totalSize: number
  count: number
  items: UnusedAsset[]
}

export interface PurgeResult {
  successCount: number
  failCount: number
  freedSpace: number
}

class MaintenanceManager {

  /**
   * 扫描未引用的资源文件
   * 修复点：增加对文件夹不存在、权限不足的防御性处理
   */
  public scanUnusedAssets(): ScanResult {
    const db = dbManager.getDb()
    const assetsRoot = path.join(dbManager.getStoragePath(), 'assets')

    // 1. 防御：如果 assets 目录压根不存在，直接返回空结果，不报错
    if (!fs.existsSync(assetsRoot)) {
      return { totalSize: 0, count: 0, items: [] }
    }

    // 2. 构建白名单 (从数据库获取所有正在使用的文件名)
    const validFiles = new Set<string>()

    // 辅助函数：解析 JSON 路径并提取文件名
    const collectPaths = (jsonStr: string) => {
      if (!jsonStr) return
      try {
        const paths = JSON.parse(jsonStr)
        if (Array.isArray(paths)) {
          for (const p of paths) {
            // 只取文件名，忽略目录差异
            const filename = path.basename(p)
            if (filename) validFiles.add(filename)
          }
        }
      } catch (e) {
        // 忽略脏数据
      }
    }

    try {
      // 搜集 Inventory 表
      const inventoryItems = db.prepare("SELECT image_paths, datasheet_paths FROM inventory").all() as any[]
      for (const item of inventoryItems) {
        collectPaths(item.image_paths)
        collectPaths(item.datasheet_paths)
      }

      // 搜集 Projects 表
      const projects = db.prepare("SELECT files FROM projects").all() as any[]
      for (const proj of projects) {
        collectPaths(proj.files)
      }
    } catch (e) {
      console.error('读取数据库白名单失败:', e)
      throw new Error('数据库读取失败，无法执行安全扫描')
    }

    // 3. 遍历物理文件系统
    const unusedItems: UnusedAsset[] = []
    let totalSize = 0

    // 递归遍历 assets 目录 (带错误处理)
    const traverse = (currentPath: string) => {
      try {
        if (!fs.existsSync(currentPath)) return

        const entries = fs.readdirSync(currentPath, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)

          try {
            if (entry.isDirectory()) {
              traverse(fullPath) // 递归进入子目录
            } else if (entry.isFile()) {
              const filename = entry.name
              // 排除系统生成的缩略图文件
              if (filename === '.DS_Store' || filename === 'Thumbs.db') continue

              // 核心判断：如果文件名不在白名单里，标记为垃圾
              if (!validFiles.has(filename)) {
                const stats = fs.statSync(fullPath)
                unusedItems.push({
                  name: filename,
                  relativePath: path.relative(assetsRoot, fullPath),
                  size: stats.size,
                  mtime: stats.mtime.getTime()
                })
                totalSize += stats.size
              }
            }
          } catch (innerErr) {
            // 忽略单个文件的权限错误，继续扫描下一个
            console.warn(`跳过文件 ${entry.name}:`, innerErr)
          }
        }
      } catch (dirErr) {
        console.warn(`无法访问目录 ${currentPath}:`, dirErr)
      }
    }

    traverse(assetsRoot)

    return {
      totalSize,
      count: unusedItems.length,
      items: unusedItems.sort((a, b) => b.size - a.size)
    }
  }

  /**
   * 执行物理删除
   */
  public purgeAssets(files: string[]): PurgeResult {
    const assetsRoot = path.join(dbManager.getStoragePath(), 'assets')
    let success = 0
    let fail = 0
    let freed = 0

    // 防御：目录不存在
    if (!fs.existsSync(assetsRoot)) {
       return { successCount: 0, failCount: files.length, freedSpace: 0 }
    }

    for (const relPath of files) {
      try {
        // 安全检查：防止路径穿越攻击
        const fullPath = path.join(assetsRoot, relPath)
        
        // 确保解析后的路径依然在 assetsRoot 内部
        if (!fullPath.startsWith(assetsRoot)) {
          fail++
          continue
        }

        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath)
          fs.unlinkSync(fullPath)
          success++
          freed += stat.size
        } else {
          // 文件可能已经被手动删除了，算作忽略
          fail++
        }
      } catch (e) {
        console.error(`删除文件失败: ${relPath}`, e)
        fail++
      }
    }

    return { successCount: success, failCount: fail, freedSpace: freed }
  }

  /**
   * 数据库深度优化
   */
  public optimizeDatabase() {
    const db = dbManager.getDb()
    
    try {
      // 1. 清理孤儿 BOM 数据 (指向了不存在的项目)
      const res = db.prepare(`
        DELETE FROM project_items 
        WHERE project_id NOT IN (SELECT id FROM projects)
      `).run()

      // 2. 执行 VACUUM (这可能会耗时且要求独占锁)
      // 我们用 try-catch 包裹 VACUUM，防止因为数据库繁忙导致整个优化失败
      try {
        db.exec('VACUUM')
      } catch (vErr: any) {
        console.warn('VACUUM 执行跳过:', vErr.message)
        // 如果是 database is locked，我们依然返回 orphansRemoved 的结果，算部分成功
        if (vErr.code !== 'SQLITE_BUSY' && vErr.code !== 'SQLITE_LOCKED') {
           throw vErr
        }
      }

      return { 
        orphansRemoved: res.changes,
        vacuumed: true 
      }
    } catch (e) {
      console.error('数据库优化严重失败:', e)
      throw e
    }
  }
}

export const maintenanceManager = new MaintenanceManager()