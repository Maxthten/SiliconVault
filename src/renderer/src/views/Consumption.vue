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
  return echarts.init(dom, 'dark')
}

const renderCharts = () => {
  if (!chartTimelineRef.value || !chartRoseRef.value || !chartHeatmapRef.value) return

  chartTimeline = initChart(chartTimelineRef.value)
  const dateList = data.value.timeline.map((i: any) => i.date)
  const valueList = data.value.timeline.map((i: any) => i.value)

  chartTimeline.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#242428',
      borderColor: '#333',
      textStyle: { color: '#fff' }
    },
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dateList,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#999' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { show: false }
    },
    dataZoom: [{
      type: 'slider',
      show: true,
      height: 16,
      bottom: 0,
      borderColor: 'transparent',
      backgroundColor: 'rgba(255,255,255,0.02)',
      fillerColor: 'rgba(99, 226, 183, 0.2)',
      handleStyle: { color: '#63e2b7' },
      textStyle: { color: '#999' }
    }],
    series: [{
      name: '消耗量',
      type: 'line',
      smooth: 0.4,
      symbol: 'none',
      lineStyle: { width: 3, color: '#63e2b7' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(99, 226, 183, 0.4)' },
          { offset: 1, color: 'rgba(99, 226, 183, 0.0)' }
        ])
      },
      data: valueList
    }]
  })

  chartRose = initChart(chartRoseRef.value)
  chartRose.on('click', (params) => {
    activeDrillDown.value = params.name
    islandAnimating.value = true
    setTimeout(() => islandAnimating.value = false, 600)
  })

  chartRose.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#242428' },
    series: [{
      type: 'pie',
      radius: [20, 100],
      center: ['50%', '50%'],
      roseType: 'area',
      itemStyle: { borderRadius: 6 },
      data: data.value.categories,
      label: { show: false }
    }]
  })

  chartHeatmap = initChart(chartHeatmapRef.value)
  const heatmapData = data.value.heatmap.map((item: any) => [item.date, item.count])
  const maxVal = Math.max(...data.value.heatmap.map((i: any) => i.count), 10)

  chartHeatmap.setOption({
    tooltip: { position: 'top', backgroundColor: '#242428' },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#2c2c2e', '#2a4c68', '#63e2b7'] },
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
        borderColor: '#242428', 
        color: 'transparent'
      },
      yearLabel: { show: false },
      dayLabel: { color: '#999', nameMap: 'cn' },
      monthLabel: { color: '#999', nameMap: 'cn' },
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
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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
              <n-icon :component="TrendingUpOutline" color="#999"/>
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
  color: #fff;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header-fixed {
  padding: 20px 24px 0;
  flex-shrink: 0; 
}

.island-wrapper { display: flex; justify-content: center; margin-bottom: 20px; }
.status-island {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 10px 24px; border-radius: 30px;
  background: #2c2c2e; 
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 8px 20px rgba(0,0,0,0.3);
  cursor: pointer; transition: all 0.3s ease;
}
.status-island:hover { transform: scale(1.02); }
.island-text { font-weight: 600; font-size: 14px; }

.island-gray { color: #999; }
.island-blue { color: #70c0e8; background: rgba(112, 192, 232, 0.1); border-color: rgba(112, 192, 232, 0.3); }
.island-purple { color: #a78bfa; background: rgba(167, 139, 250, 0.1); border-color: rgba(167, 139, 250, 0.3); }
.island-orange { color: #ff9f43; background: rgba(255, 159, 67, 0.1); border-color: rgba(255, 159, 67, 0.3); }

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
  background-color: #242428;
  border-radius: 16px;
  padding: 16px;
  display: flex; flex-direction: column;
}

.card-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: bold; color: #999;
  text-transform: uppercase; margin-bottom: 12px;
}

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
  background-color: #242428;
  border-radius: 16px; padding: 16px 20px;
  display: flex; align-items: center; gap: 16px;
  border: 1px solid rgba(255,255,255,0.05);
  transition: transform 0.2s;
}
.top-rank-card:hover { transform: translateX(4px); }

.rank-1 { background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(36, 36, 40, 0)); border-color: rgba(255, 215, 0, 0.3); }
.rank-1 .rank-icon-wrapper { color: #ffd700; }

.rank-2 { background: linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(36, 36, 40, 0)); border-color: rgba(192, 192, 192, 0.2); }
.rank-2 .rank-icon-wrapper { color: #c0c0c0; }

.rank-3 { background: linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(36, 36, 40, 0)); border-color: rgba(205, 127, 50, 0.2); }
.rank-3 .rank-icon-wrapper { color: #cd7f32; }

.rank-info { flex: 1; overflow: hidden; }
.rank-name { font-weight: bold; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-cat { font-size: 12px; color: #999; margin-top: 2px; }
.rank-value { font-family: monospace; font-size: 18px; font-weight: bold; color: #63e2b7; }

.ranking-list-card { padding-bottom: 8px; }
.rank-list-item {
  display: flex; align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 13px;
}
.rank-list-item:last-child { border-bottom: none; }
.list-index { width: 30px; color: #666; font-family: monospace; }
.list-info { flex: 1; display: flex; gap: 8px; align-items: baseline; overflow: hidden; }
.list-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list-cat { color: #666; font-size: 12px; }
.list-value { font-family: monospace; color: #999; }
.empty-tip { text-align: center; color: #666; padding: 20px; }
</style>