import { createRouter, createWebHashHistory } from 'vue-router'

// 页面组件引入
import Inventory from '../views/Inventory.vue'
import BomProject from '../views/BomProject.vue'
import ReplenishView from '../views/ReplenishView.vue'
import Consumption from '../views/Consumption.vue'
import OperationLog from '../views/OperationLog.vue'
import DataCenter from '../views/DataCenter.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  // 使用 Hash 模式，适合 Electron 环境
  history: createWebHashHistory(),
  routes: [
    // 库存管理首页
    { 
      path: '/', 
      name: 'Inventory', 
      component: Inventory 
    },
    // BOM 项目管理
    { 
      path: '/bom', 
      name: 'Bom', 
      component: BomProject 
    },
    // 补货中心
    { 
      path: '/replenish', 
      name: 'Replenish', 
      component: ReplenishView 
    },
    // 消耗看板
    {
      path: '/consumption',
      name: 'Consumption',
      component: Consumption
    },
    // 数据中心
    {
      path: '/data',
      name: 'DataCenter',
      component: DataCenter
    },
    // 操作日志
    {
      path: '/logs',
      name: 'Logs',
      component: OperationLog
    },
    // 系统设置
    {
      path: '/settings',
      name: 'Settings',
      component: SettingsView
    }
  ]
})

export default router