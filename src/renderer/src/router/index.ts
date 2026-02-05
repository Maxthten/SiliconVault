import { createRouter, createWebHashHistory } from 'vue-router'
import Inventory from '../views/Inventory.vue'
import BomProject from '../views/BomProject.vue'
import ReplenishView from '../views/ReplenishView.vue' 
import OperationLog from '../views/OperationLog.vue' 
import DataCenter from '../views/DataCenter.vue'
// 🔥 新增引入
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { 
      path: '/', 
      name: 'Inventory', 
      component: Inventory 
    },
    { 
      path: '/bom', 
      name: 'Bom', 
      component: BomProject 
    },
    { 
      path: '/replenish', 
      name: 'Replenish', 
      component: ReplenishView 
    },
    {
      path: '/logs',
      name: 'Logs',
      component: OperationLog
    },
    {
      path: '/data',
      name: 'DataCenter',
      component: DataCenter
    },
    // 🔥 新增：设置页面路由
    {
      path: '/settings',
      name: 'Settings',
      component: SettingsView
    }
  ]
})

export default router