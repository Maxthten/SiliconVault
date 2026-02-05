<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
// 🔥 引入 ServerOutline
import { CubeOutline, RocketOutline, WarningOutline, TimeOutline, ServerOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'

const router = useRouter()
const route = useRoute()
const warningLevel = ref(0)
let timer: NodeJS.Timeout | null = null

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
  } catch (e) { console.error(e) }
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
  <div class="bottom-bar">
    
    <div 
      class="tab-item" 
      :class="{ active: route.path === '/' || route.name === 'Inventory' }" 
      @click="navigateTo('/')"
    >
      <div class="icon-box"><n-icon size="24" :component="CubeOutline" /></div>
      <span class="tab-label">库存</span>
    </div>

    <div 
      class="tab-item" 
      :class="{ active: route.path === '/bom' || route.name === 'Bom' }" 
      @click="navigateTo('/bom')"
    >
      <div class="icon-box"><n-icon size="24" :component="RocketOutline" /></div>
      <span class="tab-label">项目</span>
    </div>

    <div 
      class="tab-item" 
      :class="{ active: route.path === '/data' }" 
      @click="navigateTo('/data')"
    >
      <div class="icon-box"><n-icon size="24" :component="ServerOutline" /></div>
      <span class="tab-label">数据</span>
    </div>

    <div 
      class="tab-item" 
      :class="{ active: route.path === '/logs' }" 
      @click="navigateTo('/logs')"
    >
      <div class="icon-box"><n-icon size="24" :component="TimeOutline" /></div>
      <span class="tab-label">历史</span>
    </div>

    <div 
      class="tab-item warning-item" 
      :class="{ 
        active: route.path === '/replenish' || route.name === 'Replenish',
        'is-yellow': warningLevel === 1,
        'is-red': warningLevel === 2
      }" 
      @click="navigateTo('/replenish')"
    >
      <div class="icon-box" :class="{ 'shake-anim': warningLevel === 2 }">
        <n-icon size="24" :component="WarningOutline" />
      </div>
      <span class="tab-label">补货</span>
      
      <div v-if="warningLevel > 0" class="dot"></div>
    </div>

  </div>
</template>

<style scoped>
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  height: 80px; 
  background: rgba(28, 28, 30, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255,255,255,0.1);
  
  display: flex; 
  align-items: center;
  /* 左右留一点边距，避免太靠边 */
  padding: 0 10px; 
  padding-bottom: 15px; /* 适配 iPhone 底部横条 */
  z-index: 999;

  /* 允许横向滚动 (当屏幕非常窄时) */
  overflow-x: auto;
  scroll-behavior: smooth;
  &::-webkit-scrollbar { display: none; }
  scrollbar-width: none;
}

.tab-item {
  /* 弹性布局：人少平分，人多保持最小宽度并滚动 */
  flex: 1 0 60px; 
  
  height: 100%;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  color: #666; cursor: pointer; position: relative;
  gap: 4px;
  border-radius: 8px;
}

.tab-item:active {
  background: rgba(255,255,255,0.05);
}

.icon-box { display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
.tab-label { font-size: 10px; font-weight: 500; }

.tab-item.active { color: #0A84FF; }
.tab-item.active .icon-box { transform: translateY(-2px); }

/* 警告样式 */
.warning-item.is-yellow { color: #f2c97d; }
.warning-item.is-red { color: #e88080; }
.dot { position: absolute; top: 10px; right: 25%; width: 8px; height: 8px; border-radius: 50%; background-color: currentColor; border: 1px solid #1c1c1e; }

@keyframes shake {
  0% { transform: rotate(0deg); } 5% { transform: rotate(-10deg); } 10% { transform: rotate(10deg); } 15% { transform: rotate(-10deg); } 20% { transform: rotate(0deg); } 100% { transform: rotate(0deg); }
}
.shake-anim { animation: shake 2.5s ease-in-out infinite; }
</style>