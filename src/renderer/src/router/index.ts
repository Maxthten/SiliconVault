import { createRouter, createWebHashHistory } from 'vue-router'

const Inventory = (): Promise<typeof import('../views/Inventory.vue')> =>
  import('../views/Inventory.vue')
const BomProject = (): Promise<typeof import('../views/BomProject.vue')> =>
  import('../views/BomProject.vue')
const ReplenishView = (): Promise<typeof import('../views/ReplenishView.vue')> =>
  import('../views/ReplenishView.vue')
const Consumption = (): Promise<typeof import('../views/Consumption.vue')> =>
  import('../views/Consumption.vue')
const OperationLog = (): Promise<typeof import('../views/OperationLog.vue')> =>
  import('../views/OperationLog.vue')
const DataCenter = (): Promise<typeof import('../views/DataCenter.vue')> =>
  import('../views/DataCenter.vue')
const SettingsView = (): Promise<typeof import('../views/SettingsView.vue')> =>
  import('../views/SettingsView.vue')

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
