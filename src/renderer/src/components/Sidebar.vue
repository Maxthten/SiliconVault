<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { 
  CubeOutline, 
  RocketOutline, 
  WarningOutline, 
  TimeOutline, 
  ServerOutline, 
  SettingsOutline,
  StatsChartOutline // 🔥 1. 引入图表图标
} from '@vicons/ionicons5'
import { NIcon, NTooltip } from 'naive-ui'

const router = useRouter()
const route = useRoute()

// 0: 正常, 1: 黄色预警, 2: 红色报警
const warningLevel = ref(0)
let timer: NodeJS.Timeout | null = null

// 库存健康度检测
const checkHealth = async () => {
  const isSessionSnoozed = !!sessionStorage.getItem('replenish_snooze')
  const daySnooze = localStorage.getItem('replenish_snooze_until')
  const isDaySnoozed = daySnooze && Number(daySnooze) > Date.now()

  if (isSessionSnoozed || isDaySnoozed) {
    warningLevel.value = 0
    return
  }

  try {
    const grouped = await window.api.fetchInventory({})
    let red = 0
    let yellow = 0
    
    for (const cat in grouped) {
      for (const item of grouped[cat]) {
        const min = item.min_stock ?? 10
        if (item.quantity <= 0) red++
        else if (item.quantity <= min) yellow++
      }
    }

    if (red > 0) warningLevel.value = 2
    else if (yellow > 0) warningLevel.value = 1
    else warningLevel.value = 0

  } catch (e) {
    console.error("库存检测失败:", e)
  }
}

const navigateTo = (path: string) => {
  router.push(path)
  checkHealth()
}

onMounted(() => {
  checkHealth()
  timer = setInterval(checkHealth, 10000) 
  window.addEventListener('inventory-snooze-changed', checkHealth)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('inventory-snooze-changed', checkHealth)
})
</script>

<template>
  <div class="sidebar">
    <div class="logo">📦</div>
    
    <div class="nav-group">
      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/' }" @click="navigateTo('/')">
            <n-icon size="24" :component="CubeOutline" />
          </div>
        </template>
        库存管理
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/bom' }" @click="navigateTo('/bom')">
            <n-icon size="24" :component="RocketOutline" />
          </div>
        </template>
        项目 BOM
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div 
            class="nav-item warning-item" 
            :class="{ 
              active: route.path === '/replenish', 
              'is-yellow': warningLevel === 1,
              'is-red': warningLevel === 2
            }" 
            @click="navigateTo('/replenish')"
          >
            <div class="icon-wrapper" :class="{ 'shake-anim': warningLevel === 2 }">
              <n-icon size="24" :component="WarningOutline" />
            </div>
            <div v-if="warningLevel > 0" class="dot"></div>
          </div>
        </template>
        <span>补货中心 {{ warningLevel === 2 ? '(急需!)' : '' }}</span>
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/consumption' }" @click="navigateTo('/consumption')">
            <n-icon size="24" :component="StatsChartOutline" />
          </div>
        </template>
        消耗看板
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/data' }" @click="navigateTo('/data')">
            <n-icon size="24" :component="ServerOutline" />
          </div>
        </template>
        数据中心
      </n-tooltip>

      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/logs' }" @click="navigateTo('/logs')">
            <n-icon size="24" :component="TimeOutline" />
          </div>
        </template>
        操作历史
      </n-tooltip>
    </div>

    <div class="bottom-group">
      <n-tooltip trigger="hover" placement="right">
        <template #trigger>
          <div class="nav-item" :class="{ active: route.path === '/settings' }" @click="navigateTo('/settings')">
            <n-icon size="24" :component="SettingsOutline" />
          </div>
        </template>
        系统设置
      </n-tooltip>
    </div>

  </div>
</template>

<style scoped>
.sidebar { 
  width: 70px; 
  background-color: #18181c; 
  border-right: 1px solid rgba(255, 255, 255, 0.05); 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  padding: 20px 0; /* 上下留白 */
  gap: 30px; 
  z-index: 100;
  height: 100vh; /* 撑满高度 */
  box-sizing: border-box;
}

.logo { font-size: 24px; margin-bottom: 10px; cursor: default; }

.nav-group { 
  display: flex; 
  flex-direction: column; 
  gap: 20px; 
  width: 100%; 
  align-items: center; 
}

/* 🔥 关键 CSS：将此容器顶到底部 */
.bottom-group {
  margin-top: auto; 
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  align-items: center;
}

/* 导航项样式保持不变 */
.nav-item { 
  width: 44px; height: 44px; border-radius: 12px; 
  display: flex; justify-content: center; align-items: center; 
  color: #666; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; 
}
.nav-item:hover { background-color: rgba(255, 255, 255, 0.1); color: #fff; }
.nav-item.active { background-color: #0A84FF; color: #fff; box-shadow: 0 0 15px rgba(10, 132, 255, 0.4); }

.icon-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }

/* 警告样式 */
.warning-item.is-yellow { color: #f2c97d; }
.warning-item.is-yellow:hover { background: rgba(242, 201, 125, 0.15); }
.warning-item.is-yellow.active { background: #f2c97d; color: #000; box-shadow: 0 0 15px rgba(242, 201, 125, 0.3); }

.warning-item.is-red { color: #e88080; }
.warning-item.is-red:hover { background: rgba(232, 128, 128, 0.15); }
.warning-item.is-red.active { background: #e88080; color: #fff; box-shadow: 0 0 15px rgba(232, 128, 128, 0.4); }

.dot { position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background-color: currentColor; }

@keyframes shake {
  0% { transform: rotate(0deg); } 5% { transform: rotate(-10deg); } 10% { transform: rotate(10deg); } 15% { transform: rotate(-10deg); } 20% { transform: rotate(0deg); } 100% { transform: rotate(0deg); }
}
.shake-anim { animation: shake 2.5s ease-in-out infinite; transform-origin: center center; }

@media (max-width: 768px) {
  .sidebar { display: none !important; }
}
</style>