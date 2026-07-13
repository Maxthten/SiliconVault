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
import { dbManager, type DBManager } from './db'
import type {
  ConsumptionData,
  InventoryItem,
  OperationLog
} from '../shared/types'

interface AnalyticsStockDetail {
  inventory_id: number
  name?: string
  value?: string
  category?: string
  package?: string
  delta: number
}

export class AnalyticsManager {
  constructor(private readonly databaseManager: Pick<DBManager, 'getDb'> = dbManager) {}
  
  public getConsumptionStats(range: 'day' | 'week' | 'month' = 'week', useMock: boolean = false): ConsumptionData {
    if (useMock) {
      return this.generateMockData(range)
    }
    return this.calculateRealStats(range)
  }

  private calculateRealStats(range: string): ConsumptionData {
    const db = this.databaseManager.getDb()
    
    const now = new Date()
    const startDate = new Date()
    if (range === 'day') startDate.setDate(now.getDate() - 1)
    if (range === 'week') startDate.setDate(now.getDate() - 7)
    if (range === 'month') startDate.setDate(now.getDate() - 30)

    const startTimeStr = startDate.toISOString().replace('T', ' ').split('.')[0]

    const logs = db.prepare(`
      SELECT * FROM operation_logs 
      WHERE op_type = 'STOCK' 
      AND undone_at IS NULL
      AND created_at >= ?
      ORDER BY created_at ASC
    `).all(startTimeStr) as OperationLog[]

    const timelineMap = new Map<string, number>()
    const categoryMap = new Map<string, number>()
    const itemTotalMap = new Map<number, number>()
    const itemMeta = new Map<number, { name: string; category: string; value: string; package: string }>() 
    const projectTotalMap = new Map<string, number>()

    let totalConsumed = 0

    for (const log of logs) {
      if (![
        'INVENTORY_MANUAL_OUT',
        'INVENTORY_BATCH_ADJUST',
        'BOM_PRODUCTION_DEDUCTION',
        'LEGACY'
      ].includes(log.event_code || 'LEGACY')) {
        continue
      }

      const date = (log.created_at || '').split(' ')[0]
      if (!date) continue
      const details = this.extractStockDetails(log)
      for (const detail of details) {
        if (detail.delta >= 0) continue
        const qty = Math.abs(detail.delta)
        const id = detail.inventory_id
        const category = detail.category || '未分类'
        itemMeta.set(id, {
          name: detail.name || `未知元件 #${id}`,
          category,
          value: detail.value || '',
          package: detail.package || ''
        })
        this.aggregate(qty, date, category, id, timelineMap, categoryMap, itemTotalMap)
        totalConsumed += qty
      }

      if (log.event_code === 'BOM_PRODUCTION_DEDUCTION') {
        const payload = this.parseJson<{ projectName?: string }>(log.details)
        const projectName = String(payload?.projectName || '').trim()
        if (projectName) {
          const consumed = details
            .filter(detail => detail.delta < 0)
            .reduce((sum, detail) => sum + Math.abs(detail.delta), 0)
          projectTotalMap.set(projectName, (projectTotalMap.get(projectName) || 0) + consumed)
        }
      }
    }

    const timeline = Array.from(timelineMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const categories = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 

    const ranking = Array.from(itemTotalMap.entries())
      .map(([id, value]) => {
        const meta = itemMeta.get(id)
        return { 
          name: meta?.name || `未知元件 #${id}`, 
          category: meta?.category || '其他', 
          value,
          originalValue: meta?.value || '',
          package: meta?.package || ''
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) 

    const heatmap = timeline.map(t => ({ date: t.date, count: t.value }))

    const activeProject = Array.from(projectTotalMap.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '__DAILY__'

    return {
      summary: {
        totalQuantity: totalConsumed,
        topCategory: categories[0]?.name || '无数据',
        activeProject: activeProject,
        intensity: totalConsumed > 500 ? 'high' : (totalConsumed > 100 ? 'medium' : 'low')
      },
      timeline,
      categories,
      heatmap,
      ranking
    }
  }

  private extractStockDetails(log: OperationLog): AnalyticsStockDetail[] {
    const payload = this.parseJson<{ items?: AnalyticsStockDetail[] }>(log.details)
    if (Array.isArray(payload?.items)) return payload.items

    const oldData = this.parseJson<Partial<InventoryItem>>(log.old_data)
    const newData = this.parseJson<Partial<InventoryItem>>(log.new_data)
    if (!oldData || !newData) return []
    const oldQty = Number(oldData.quantity)
    const newQty = Number(newData.quantity)
    if (!Number.isFinite(oldQty) || !Number.isFinite(newQty)) return []
    return [{
      inventory_id: log.target_id,
      name: oldData.name,
      value: oldData.value,
      category: oldData.category,
      package: oldData.package,
      delta: newQty - oldQty
    }]
  }

  private parseJson<T>(value?: string | null): T | null {
    if (!value) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }

  private aggregate(qty: number, date: string, cat: string, id: number, 
    tLine: Map<string, number>, catMap: Map<string, number>, itemMap: Map<number, number>): void {
    
    tLine.set(date, (tLine.get(date) || 0) + qty)
    catMap.set(cat, (catMap.get(cat) || 0) + qty)
    itemMap.set(id, (itemMap.get(id) || 0) + qty)
  }
  
  private generateMockData(range: string): ConsumptionData {
    const days = range === 'month' ? 30 : 7
    const timeline: { date: string; value: number }[] = []
    const heatmap: { date: string; count: number }[] = []
    
    const now = new Date()
    let total = 0

    for (let i = days; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      
      const base = 50
      const noise = Math.random() * 100
      const wave = Math.sin(i * 0.5) * 40
      const val = Math.floor(Math.max(0, base + wave + noise))
      
      timeline.push({ date: dateStr, value: val })
      heatmap.push({ date: dateStr, count: val })
      total += val
    }

    return {
      summary: {
        totalQuantity: total,
        topCategory: '芯片(IC)',
        activeProject: 'BOM: 机械臂控制板 V2',
        intensity: 'high'
      },
      timeline,
      categories: [
        { name: '电阻', value: Math.floor(total * 0.4) },
        { name: '电容', value: Math.floor(total * 0.3) },
        { name: '芯片(IC)', value: Math.floor(total * 0.15) },
        { name: '连接器', value: Math.floor(total * 0.1) },
        { name: '二极管', value: Math.floor(total * 0.05) },
      ],
      heatmap,
      ranking: [
        { name: '0603 10k 1%', category: '电阻', value: 1204, originalValue: '10k', package: '0603' },
        { name: 'STM32F103C8T6', category: '芯片(IC)', value: 85, originalValue: 'MCU', package: 'LQFP48' },
        { name: '100nF 50V', category: '电容', value: 540, originalValue: '100nF', package: '0603' },
        { name: 'Type-C 母座', category: '连接器', value: 42, originalValue: '16Pin', package: 'SMD' },
        { name: 'SS8050', category: '三极管', value: 33, originalValue: 'NPN', package: 'SOT-23' },
      ]
    }
  }
}

export const analyticsManager = new AnalyticsManager()
