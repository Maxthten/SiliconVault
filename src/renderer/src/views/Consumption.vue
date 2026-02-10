<!--
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
-->
<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue'
import { NSpin, NIcon, NButton, NSelect, NPopover } from 'naive-ui'
import { 
  FlashOutline, 
  StatsChartOutline, 
  HardwareChipOutline, 
  FlameOutline, 
  ConstructOutline,
  ColorWandOutline,
  CalendarOutline,
  TrophyOutline,
  RibbonOutline,
  MedalOutline,
  TrendingUpOutline 
} from '@vicons/ionicons5'
import * as echarts from 'echarts'

const SHOW_DEBUG_BUTTON = true 

const loading = ref(false)
const timeRange = ref<'day' | 'week' | 'month'>('week')
const isMock = ref(false)

// --- 主题检测逻辑 ---
const isDark = ref(document.documentElement.getAttribute('data-theme') !== 'light')
let themeObserver: MutationObserver | null = null

const chartTimelineRef = ref<HTMLElement | null>(null)
const chartRoseRef = ref<HTMLElement | null>(null)
const chartHeatmapRef = ref<HTMLElement | null>(null)

let chartTimeline: echarts.ECharts | null = null
let chartRose: echarts.ECharts | null = null
let chartHeatmap: echarts.ECharts | null = null

const data = ref<any>({
  summary: { totalQuantity: 0, topCategory: '-', activeProject: '-', intensity: 'low' },
  timeline: [],
  categories: [],
  heatmap: [],
  ranking: []
})

const categoryRules = ref<Record<string, any>>({})

const islandAnimating = ref(false)
const activeDrillDown = ref<string | null>(null)

// 状态岛配置
const islandStatus = computed(() => {
  if (activeDrillDown.value) {
    return {
      text: `正在分析: ${activeDrillDown.value}`,
      icon: StatsChartOutline,
      colorClass: 'island-blue'
    }
  }

  const timeLabels: Record<string, string> = {
    day: '今日',
    week: '本周',
    month: '本月'
  }
  const timePrefix = timeLabels[timeRange.value] || '当前'

  const intensity = data.value.summary.intensity
  if (intensity === 'high') {
    return {
      text: `火力全开！${timePrefix}消耗 ${data.value.summary.totalQuantity} 元件`,
      icon: FlameOutline,
      colorClass: 'island-orange'
    }
  } else if (intensity === 'medium') {
    return {
      text: `研发推进中 - ${timePrefix}活跃: ${data.value.summary.activeProject}`,
      icon: ConstructOutline,
      colorClass: 'island-purple'
    }
  } else {
    return {
      text: `${timePrefix}风平浪静，暂无大量消耗`,
      icon: HardwareChipOutline,
      colorClass: 'island-gray'
    }
  }
})

const top3Ranking = computed<any[]>(() => data.value.ranking.slice(0, 3))
const restRanking = computed<any[]>(() => data.value.ranking.slice(3))

const loadRules = async () => {
  try {
    const cats = await window.api.fetchCategories()
    const promises = cats.map(async (cat: string) => {
       const rule = await window.api.getCategoryRule(cat)
       return { cat, rule }
    })
    const results = await Promise.all(promises)
    const map: Record<string, any> = {}
    results.forEach(r => map[r.cat] = r.rule)
    categoryRules.value = map
  } catch (e) { console.error('加载规则失败', e) }
}

const getDisplayName = (item: any) => {
  const rule = categoryRules.value[item.category]
  let targetKey = 'name'

  if (rule?.layout) {
    if (typeof rule.layout === 'object' && rule.layout.topLeft) {
      targetKey = rule.layout.topLeft
    } else if (Array.isArray(rule.layout) && rule.layout[0]) {
      targetKey = rule.layout[0]
    }
  }

  let displayVal = item[targetKey]

  if (targetKey === 'value' && typeof displayVal === 'number') {
    displayVal = item.spec || item.parameter || item.originalValue || item.name 
  }

  return displayVal || item.name || '未命名'
}

const loadData = async () => {
  loading.value = true
  islandAnimating.value = true
  setTimeout(() => islandAnimating.value = false, 600)

  await loadRules()

  try {
    const res = await window.api.getConsumptionStats(timeRange.value, isMock.value)
    data.value = res
    activeDrillDown.value = null
    
    nextTick(() => {
      renderCharts()
    })
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const toggleMock = () => {
  isMock.value = !isMock.value
  loadData()
}

const initChart = (dom: HTMLElement) => {
  const existingInstance = echarts.getInstanceByDom(dom)
  if (existingInstance) {
    existingInstance.dispose()
  }
  // 显式指定主题为 null，完全由 option 控制颜色
  return echarts.init(dom, null)
}

// 核心：获取当前主题对应的图表配色
const getChartTheme = () => {
  const dark = isDark.value
  // 获取当前卡片背景色，用于切割日历格
  const cardBg = dark ? '#2c2c2e' : '#ffffff' // 需与 CSS 中的 --bg-card 一致

  return {
    textColor: dark ? '#999' : '#666',
    splitLine: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    tooltipBg: dark ? '#2c2c2e' : '#ffffff',
    tooltipBorder: dark ? '#333' : '#eee',
    tooltipText: dark ? '#fff' : '#333',
    
    // 日历热力图专用颜色
    calendarItemBorder: cardBg, // 边框颜色 = 背景色，制造间隙感
    heatmapEmpty: dark ? '#3a3a3e' : '#F2F2F7', // 空格子颜色：暗色微亮，亮色浅灰
    
    lineColor: '#63e2b7', // 主色调保持一致
    areaStart: 'rgba(99, 226, 183, 0.4)',
    areaEnd: 'rgba(99, 226, 183, 0.0)'
  }
}

const renderCharts = () => {
  if (!chartTimelineRef.value || !chartRoseRef.value || !chartHeatmapRef.value) return

  const theme = getChartTheme()

  // --- 1. Timeline Chart ---
  chartTimeline = initChart(chartTimelineRef.value)
  const dateList = data.value.timeline.map((i: any) => i.date)
  const valueList = data.value.timeline.map((i: any) => i.value)

  chartTimeline.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1);'
    },
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dateList,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.textColor }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.splitLine } },
      axisLabel: { show: false }
    },
    dataZoom: [{
      type: 'slider',
      show: true,
      height: 16,
      bottom: 0,
      borderColor: 'transparent',
      backgroundColor: theme.splitLine,
      fillerColor: 'rgba(99, 226, 183, 0.2)',
      handleStyle: { color: '#63e2b7' },
      textStyle: { color: theme.textColor }
    }],
    series: [{
      name: '消耗量',
      type: 'line',
      smooth: 0.4,
      symbol: 'none',
      lineStyle: { width: 3, color: theme.lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: theme.areaStart },
          { offset: 1, color: theme.areaEnd }
        ])
      },
      data: valueList
    }]
  })

  // --- 2. Rose Chart ---
  chartRose = initChart(chartRoseRef.value)
  chartRose.on('click', (params) => {
    activeDrillDown.value = params.name
    islandAnimating.value = true
    setTimeout(() => islandAnimating.value = false, 600)
  })

  chartRose.setOption({
    tooltip: { 
      trigger: 'item', 
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText }
    },
    series: [{
      type: 'pie',
      radius: [20, 100],
      center: ['50%', '50%'],
      roseType: 'area',
      itemStyle: { 
        borderRadius: 6,
        borderColor: theme.calendarItemBorder, // 利用边框模拟间隙
        borderWidth: 2
      },
      data: data.value.categories,
      label: { show: false }
    }]
  })

  // --- 3. Heatmap Chart ---
  chartHeatmap = initChart(chartHeatmapRef.value)
  const heatmapData = data.value.heatmap.map((item: any) => [item.date, item.count])
  const maxVal = Math.max(...data.value.heatmap.map((i: any) => i.count), 10)

  chartHeatmap.setOption({
    tooltip: { 
      position: 'top', 
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText } 
    },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: isDark.value ? ['#3a3a3e', '#2a4c68', '#63e2b7'] : ['#F2F2F7', '#9be9a8', '#30a14e'] }, // 起始色与 heatmapEmpty 一致，实现平滑过渡
      textStyle: { show: false }
    },
    calendar: {
      top: 30,
      left: 30,
      right: 30,
      cellSize: ['auto', 14],
      range: getHeatmapRange(timeRange.value),
      itemStyle: {
        borderWidth: 3,
        borderColor: theme.calendarItemBorder,  // 核心：用背景色做切割线
        color: theme.heatmapEmpty               // 核心：给空格子上色
      },
      yearLabel: { show: false },
      dayLabel: { color: theme.textColor, nameMap: 'cn' },
      monthLabel: { color: theme.textColor, nameMap: 'cn' },
      splitLine: { show: false }
    },
    series: [{
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: heatmapData,
      itemStyle: { borderRadius: 4 }
    }]
  })
}

const getHeatmapRange = (range: string) => {
  const end = new Date()
  const start = new Date()
  if (range === 'month') start.setDate(end.getDate() - 35)
  else start.setDate(end.getDate() - 150)
  return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]]
}

const handleResize = () => {
  chartTimeline?.resize()
  chartRose?.resize()
  chartHeatmap?.resize()
}

watch(timeRange, () => loadData())

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
  
  // 监听主题变化，实时重绘 Canvas
  themeObserver = new MutationObserver(() => {
    const newIsDark = document.documentElement.getAttribute('data-theme') !== 'light'
    if (newIsDark !== isDark.value) {
      isDark.value = newIsDark
      renderCharts()
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  themeObserver?.disconnect()
  chartTimeline?.dispose()
  chartRose?.dispose()
  chartHeatmap?.dispose()
})

const getRankIcon = (index: number) => {
  if (index === 0) return TrophyOutline
  if (index === 1) return MedalOutline
  return RibbonOutline
}
</script>

<template>
  <div class="consumption-page">
    
    <div class="header-fixed">
      <div class="island-wrapper">
        <div 
          class="status-island" 
          :class="[islandStatus.colorClass, { 'jelly-bounce': islandAnimating }]"
          @click="loadData"
        >
          <n-icon size="20" :component="islandStatus.icon" />
          <span class="island-text">{{ islandStatus.text }}</span>
        </div>
      </div>

      <div class="control-bar">
        <n-select 
          v-model:value="timeRange" 
          :options="[
            { label: '最近 24 小时', value: 'day'}, 
            { label: '本周趋势', value: 'week'}, 
            { label: '本月概览', value: 'month'}
          ]"
          size="small"
          class="range-select"
        />
        
        <n-popover trigger="hover" v-if="SHOW_DEBUG_BUTTON">
          <template #trigger>
            <n-button 
              circle 
              secondary 
              size="small" 
              :type="isMock ? 'primary' : 'default'"
              @click="toggleMock"
              class="debug-btn"
            >
              <template #icon><n-icon :component="ColorWandOutline" /></template>
            </n-button>
          </template>
          <span>调试模式：{{ isMock ? '已开启 (模拟数据)' : '已关闭 (真实数据)' }}</span>
        </n-popover>
      </div>
    </div>

    <div class="scroll-content">
      <n-spin :show="loading">
        <div class="dashboard-grid">
          
          <div class="chart-card wide-card">
            <div class="card-header">
              <n-icon :component="FlashOutline" color="#63e2b7"/>
              <span>消耗趋势 (Timeline)</span>
            </div>
            <div class="chart-container timeline-chart" ref="chartTimelineRef"></div>
          </div>

          <div class="middle-row">
            <div class="chart-card square-card">
              <div class="card-header">
                <n-icon :component="StatsChartOutline" color="#70c0e8"/>
                <span>成分构成</span>
              </div>
              <div class="chart-container rose-chart" ref="chartRoseRef"></div>
            </div>

            <div class="top-ranking-container">
              <div 
                v-for="(item, index) in top3Ranking" 
                :key="item.name" 
                class="top-rank-card"
                :class="'rank-' + (index + 1)"
              >
                <div class="rank-icon-wrapper">
                  <n-icon size="24" :component="getRankIcon(index)" />
                </div>
                <div class="rank-info">
                  <div class="rank-name" :title="getDisplayName(item)">{{ getDisplayName(item) }}</div>
                  <div class="rank-cat">{{ item.category }}</div>
                </div>
                <div class="rank-value">{{ item.value }}</div>
              </div>
              <div v-if="top3Ranking.length === 0" class="empty-tip">暂无数据</div>
            </div>
          </div>

          <div class="chart-card wide-card">
            <div class="card-header">
              <n-icon :component="CalendarOutline" color="#a78bfa"/>
              <span>研发日历 (Activity)</span>
            </div>
            <div class="chart-container heatmap-chart" ref="chartHeatmapRef"></div>
          </div>

          <div class="chart-card wide-card ranking-list-card" v-if="restRanking.length > 0">
            <div class="card-header">
              <n-icon :component="TrendingUpOutline" class="header-icon-gray"/>
              <span>详细排名 (4-10)</span>
            </div>
            <div class="ranking-list">
              <div v-for="(item, index) in restRanking" :key="index" class="rank-list-item">
                <div class="list-index">{{ index + 4 }}</div>
                <div class="list-info">
                  <span class="list-name">{{ getDisplayName(item) }}</span>
                  <span class="list-cat">{{ item.category }}</span>
                </div>
                <div class="list-value">{{ item.value }}</div>
              </div>
            </div>
          </div>

        </div>
      </n-spin>
    </div>
  </div>
</template>

<style scoped>
.consumption-page {
  background-color: transparent; 
  color: var(--text-primary);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header-fixed {
  padding: 20px 24px 0;
  flex-shrink: 0; 
}

/* --- 状态岛样式 (复用 ReplenishView 逻辑) --- */
.island-wrapper { display: flex; justify-content: center; margin-bottom: 20px; }
.status-island {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 10px 24px; border-radius: 30px;
  background: var(--bg-card); /* 变量化 */
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  cursor: pointer; transition: all 0.3s ease;
  color: var(--text-primary);
}
.status-island:hover { transform: scale(1.02); }
.island-text { font-weight: 600; font-size: 14px; }

/* 状态岛颜色：暗色透光，亮色实心 */
.island-gray { color: #999; }
.island-blue { color: #70c0e8; background: rgba(112, 192, 232, 0.1); border-color: rgba(112, 192, 232, 0.3); }
.island-purple { color: #a78bfa; background: rgba(167, 139, 250, 0.1); border-color: rgba(167, 139, 250, 0.3); }
.island-orange { color: #ff9f43; background: rgba(255, 159, 67, 0.1); border-color: rgba(255, 159, 67, 0.3); }

/* 亮色模式实心化覆写 */
:global([data-theme="light"]) .island-gray { background: #f2f2f7; color: #666; border-color: transparent; }
:global([data-theme="light"]) .island-blue { background: #eaf6fd; color: #007aff; border-color: #cce4f6; }
:global([data-theme="light"]) .island-purple { background: #f4f1fd; color: #5856d6; border-color: #ded6f8; }
:global([data-theme="light"]) .island-orange { background: #fff4e5; color: #ff9500; border-color: #ffe0b2; }

.jelly-bounce { animation: jelly-bounce 0.6s; }
@keyframes jelly-bounce {
  0% { transform: scale(1, 1); } 30% { transform: scale(0.95, 1.05); } 50% { transform: scale(1.05, 0.95); } 70% { transform: scale(0.98, 1.02); } 100% { transform: scale(1, 1); }       
}

.control-bar { display: flex; justify-content: space-between; margin-bottom: 16px; }
.range-select { width: 140px; }
.debug-btn { margin-left: auto; }

.scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 30px; 
}

.dashboard-grid {
  display: flex; flex-direction: column; gap: 20px;
}

.chart-card {
  background-color: var(--bg-card); 
  border-radius: 16px;
  padding: 16px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
}

.card-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: bold; color: var(--text-tertiary);
  text-transform: uppercase; margin-bottom: 12px;
}
.header-icon-gray { color: var(--text-tertiary); }

.chart-container { width: 100%; }
.timeline-chart { min-height: 280px; }
.rose-chart { min-height: 220px; }
.heatmap-chart { min-height: 200px; }

.middle-row {
  display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px;
}
@media (max-width: 900px) {
  .middle-row { grid-template-columns: 1fr; } 
}

.top-ranking-container {
  display: flex; flex-direction: column; gap: 12px; justify-content: center;
}
.top-rank-card {
  background-color: var(--bg-card);
  border-radius: 16px; padding: 16px 20px;
  display: flex; align-items: center; gap: 16px;
  border: 1px solid var(--border-main);
  transition: transform 0.2s;
  box-shadow: var(--shadow-card);
}
.top-rank-card:hover { transform: translateX(4px); }

/* --- Rank 卡片颜色逻辑 --- */

/* 暗色模式：保持原有渐变 */
.rank-1 { background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(36, 36, 40, 0)); border-color: rgba(255, 215, 0, 0.3); }
.rank-1 .rank-icon-wrapper { color: #ffd700; }

.rank-2 { background: linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(36, 36, 40, 0)); border-color: rgba(192, 192, 192, 0.2); }
.rank-2 .rank-icon-wrapper { color: #c0c0c0; }

.rank-3 { background: linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(36, 36, 40, 0)); border-color: rgba(205, 127, 50, 0.2); }
.rank-3 .rank-icon-wrapper { color: #cd7f32; }

/* 亮色模式：改为实心淡彩背景 + 深色边框 */
:global([data-theme="light"]) .rank-1 { background: #fffcf0; border-color: #e6c559; }
:global([data-theme="light"]) .rank-1 .rank-icon-wrapper { color: #d4a017; }

:global([data-theme="light"]) .rank-2 { background: #f9f9f9; border-color: #d1d1d6; }
:global([data-theme="light"]) .rank-2 .rank-icon-wrapper { color: #7f7f7f; }

:global([data-theme="light"]) .rank-3 { background: #fff5eb; border-color: #e3b081; }
:global([data-theme="light"]) .rank-3 .rank-icon-wrapper { color: #b06a28; }

.rank-info { flex: 1; overflow: hidden; }
.rank-name { font-weight: bold; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
.rank-cat { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.rank-value { font-family: monospace; font-size: 18px; font-weight: bold; color: #63e2b7; }
:global([data-theme="light"]) .rank-value { color: #30a14e; }

.ranking-list-card { padding-bottom: 8px; }
.rank-list-item {
  display: flex; align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-main);
  font-size: 13px;
}
.rank-list-item:last-child { border-bottom: none; }
.list-index { width: 30px; color: var(--text-tertiary); font-family: monospace; }
.list-info { flex: 1; display: flex; gap: 8px; align-items: baseline; overflow: hidden; }
.list-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
.list-cat { color: var(--text-tertiary); font-size: 12px; }
.list-value { font-family: monospace; color: var(--text-tertiary); }
.empty-tip { text-align: center; color: var(--text-tertiary); padding: 20px; }
</style>