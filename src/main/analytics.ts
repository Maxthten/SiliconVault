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
import { dbManager } from './db'

export interface ConsumptionData {
  summary: {
    totalQuantity: number
    topCategory: string
    activeProject: string
    intensity: 'low' | 'medium' | 'high'
  }
  timeline: { date: string; value: number }[]
  categories: { name: string; value: number }[]
  heatmap: { date: string; count: number }[]
  ranking: { 
    name: string
    category: string
    value: number
    originalValue?: string 
    package?: string       
  }[]
}

class AnalyticsManager {
  
  public getConsumptionStats(range: 'day' | 'week' | 'month' = 'week', useMock: boolean = false): ConsumptionData {
    if (useMock) {
      return this.generateMockData(range)
    }
    return this.calculateRealStats(range)
  }

  private calculateRealStats(range: string): ConsumptionData {
    const db = dbManager.getDb()
    
    const now = new Date()
    let startDate = new Date()
    if (range === 'day') startDate.setDate(now.getDate() - 1)
    if (range === 'week') startDate.setDate(now.getDate() - 7)
    if (range === 'month') startDate.setDate(now.getDate() - 30)

    const startTimeStr = startDate.toISOString().replace('T', ' ').split('.')[0]

    const logs = db.prepare(`
      SELECT * FROM operation_logs 
      WHERE op_type = 'STOCK' 
      AND created_at >= ?
      ORDER BY created_at ASC
    `).all(startTimeStr) as any[]

    const timelineMap = new Map<string, number>()
    const categoryMap = new Map<string, number>()
    const itemTotalMap = new Map<number, number>()
    const itemMeta = new Map<number, { name: string; category: string; value: string; package: string }>() 
    
    const manualNetMap = new Map<string, number>() 

    logs.forEach(log => {
      if (!log.old_data || !log.new_data) return
      const oldData = JSON.parse(log.old_data)
      const newData = JSON.parse(log.new_data)
      const id = log.target_id

      if (!itemMeta.has(id)) {
        itemMeta.set(id, { 
          name: oldData.name, 
          category: oldData.category || '未分类',
          value: oldData.value || '', 
          package: oldData.package || ''
        })
      }

      const isBomDeduction = log.desc && log.desc.includes('生产扣减')
      const date = log.created_at.split(' ')[0] 
      const change = newData.quantity - oldData.quantity

      if (!isBomDeduction) {
        const key = `${date}_${id}`
        manualNetMap.set(key, (manualNetMap.get(key) || 0) + change)
      }
    })

    let totalConsumed = 0

    logs.forEach(log => {
      if (!log.old_data || !log.new_data) return
      
      const isBomDeduction = log.desc && log.desc.includes('生产扣减')
      if (!isBomDeduction) return 

      const oldData = JSON.parse(log.old_data)
      const newData = JSON.parse(log.new_data)
      const change = newData.quantity - oldData.quantity
      const date = log.created_at.split(' ')[0]
      const id = log.target_id

      const qty = Math.abs(change)
      this.aggregate(qty, date, oldData.category || '未分类', id, timelineMap, categoryMap, itemTotalMap)
      totalConsumed += qty
    })

    manualNetMap.forEach((netChange, key) => {
      if (netChange < 0) {
        const [date, idStr] = key.split('_')
        const id = Number(idStr)
        const meta = itemMeta.get(id)
        if (meta) {
          const qty = Math.abs(netChange)
          this.aggregate(qty, date, meta.category, id, timelineMap, categoryMap, itemTotalMap)
          totalConsumed += qty
        }
      }
    })

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

    // 使用特殊标识符替代硬编码中文，交由前端翻译
    const activeProject = "__DAILY__" 

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

  private aggregate(qty: number, date: string, cat: string, id: number, 
    tLine: Map<string, number>, catMap: Map<string, number>, itemMap: Map<number, number>) {
    
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