# SiliconVault - AI 参考文档

> 本文档专为AI助手设计，用于快速了解项目结构、API接口和功能模块

## 项目概述

**项目名称**: SiliconVault  
**版本**: 1.1.1  
**项目类型**: Electron + Vue 3 + TypeScript 桌面应用  
**核心功能**: 电子元器件库存管理系统  
**数据库**: SQLite (Better-SQLite3)  
**架构模式**: 主进程-渲染进程分离架构  
**作者**: Maxton Niu

## 🏗️ 项目架构

### 技术栈
- **前端**: Vue 3 + TypeScript + Naive UI + Vue Router
- **构建工具**: Electron-Vite
- **数据库**: Better-SQLite3
- **状态管理**: 原生Vue响应式系统
- **图表**: ECharts
- **文件处理**: Adm-Zip, PapaParse

### 目录结构
```
SiliconVault/
├── src/
│   ├── main/           # 主进程代码
│   ├── preload/        # 预加载脚本
│   └── renderer/       # 渲染进程前端
├── resources/          # 资源文件
├── build/             # 构建配置
└── 配置文件...
```

## 📦 主进程 (src/main/)

### `index.ts` - 应用入口和窗口管理
**功能**: Electron应用主入口，窗口创建，IPC通信注册，自动备份

**关键特性**:
- 窗口配置：900x670，暗色主题，自动隐藏菜单栏
- 自动备份系统：支持定时备份和退出时备份
- 自定义协议：`local-resource://` 用于本地资源访问

**IPC通信处理器**:
- **库存管理**: `get-categories`, `get-packages`, `get-inventory`, `update-qty`, `delete-item`, `upsert-item`
- **BOM项目**: `get-projects`, `get-project-detail`, `save-project`, `delete-project`, `execute-deduction`
- **排序与规则**: `update-sort-order`, `get-category-rule`, `save-category-rule`, `reset-category-rule`
- **操作日志**: `get-logs`, `undo-operation`
- **数据导入导出**: `export-data`, `read-file-text`, `batch-import-inventory`, `export-bundle`, `scan-bundle`, `execute-import-bundle`
- **系统设置**: `get-storage-path`, `open-data-folder`, `open-file`, `show-item-in-folder`, `save-asset`, `save-buffer`
- **维护功能**: `scan-unused-assets`, `purge-unused-assets`, `optimize-database`
- **应用信息**: `get-app-version`, `get-app-settings`, `save-app-settings`

### `db.ts` - 数据库核心管理
**功能**: SQLite数据库管理，数据CRUD操作，事务处理

**关键类**: `DBManager`

**数据表结构**:
```sql
-- 元器件库存表
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT, name TEXT, value TEXT, package TEXT,
  quantity INTEGER, location TEXT, min_stock INTEGER DEFAULT 10,
  image_paths TEXT, datasheet_paths TEXT, order_index INTEGER DEFAULT 0
)

-- BOM项目表
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  order_index INTEGER DEFAULT 0, files TEXT
)

-- 项目-元器件关联表
CREATE TABLE project_items (
  project_id INTEGER, inventory_id INTEGER, quantity INTEGER,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id)
)

-- 操作日志表
CREATE TABLE operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op_type TEXT, target_type TEXT, target_id INTEGER,
  desc TEXT, old_data TEXT, new_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- 分类规则表
CREATE TABLE category_rules (
  category TEXT PRIMARY KEY, rule_json TEXT
)

-- 排序表
CREATE TABLE sort_orders (
  table_name TEXT PRIMARY KEY, id_order TEXT
)

-- 应用设置表
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY, value TEXT
)
```

**主要方法**:
- `fetchCategories()`: 获取所有分类
- `fetchPackages(category)`: 获取分类下的封装类型
- `fetchGrouped(filters)`: 获取分组库存数据
- `updateQty(id, qty)`: 更新库存数量
- `deleteItem(id)`: 删除元器件
- `upsert(data)`: 创建或更新元器件
- `getProjects(query)`: 获取BOM项目列表
- `getProjectDetail(projectId)`: 获取项目详情
- `saveProject(project)`: 保存BOM项目
- `deleteProject(id)`: 删除项目
- `executeDeduction(items)`: 执行库存扣减
- `getCategoryRule(cat)`: 获取分类规则
- `saveCategoryRule(cat, rule)`: 保存分类规则
- `resetCategoryRule(cat)`: 重置分类规则
- `updateSortOrder(table, ids)`: 更新排序
- `getLogs()`: 获取操作日志
- `undoOperation(logId)`: 撤销操作
- `getAppSettings()`: 获取应用设置
- `saveAppSettings(settings)`: 保存应用设置

### `backup.ts` - 备份管理
**关键类**: `BackupManager`

**功能**: 数据备份、恢复、导入导出，资源包管理

**主要方法**:
- `exportBundle(options)`: 导出完整资源包(.svdata)
- `scanBundle(filePath)`: 扫描资源包内容
- `executeImportBundle(scanId, strategies)`: 执行资源包导入
- `generateTemplate(filePath)`: 生成导入模板
- `createAutoBackup(path)`: 创建自动备份
- `cleanOldBackups(path, maxBackups)`: 清理旧备份

### `maintenance.ts` - 系统维护
**关键类**: `MaintenanceManager`

**功能**: 资源清理、数据库优化、性能维护

**主要方法**:
- `scanUnusedAssets()`: 扫描未使用资源文件
- `purgeUnusedAssets(files)`: 清理未使用资源
- `optimizeDatabase()`: 优化数据库性能

### `analytics.ts` - 数据分析
**关键类**: `AnalyticsManager`

**功能**: 消耗统计、数据分析、可视化数据生成

**主要方法**:
- `getConsumptionStats(range, useMock)`: 获取消耗统计数据
- `calculateRealStats(range)`: 计算真实统计数据
- `generateMockData(range)`: 生成模拟数据

## 🔌 预加载脚本 (src/preload/)

### `index.ts` - 主进程与渲染进程通信桥梁
**功能**: 暴露安全的API给渲染进程，类型安全通信

**暴露的API对象**: `window.api`

**API分类**:

#### 1. 库存管理
- `fetchCategories()`: 获取所有分类
- `fetchPackages(category)`: 根据分类获取封装类型
- `fetchInventory(filters)`: 获取库存数据（支持过滤）
- `updateQty(id, qty)`: 更新元器件库存数量
- `deleteItem(id)`: 删除元器件
- `upsertItem(data)`: 创建或更新元器件

#### 2. BOM项目管理
- `getProjects(query)`: 获取BOM项目列表
- `getProjectDetail(id)`: 获取项目详情
- `saveProject(project)`: 保存BOM项目
- `deleteProject(id)`: 删除项目
- `executeDeduction(items)`: 执行库存扣减

#### 3. 排序与规则
- `updateSortOrder(table, ids)`: 更新排序顺序
- `getCategoryRule(cat)`: 获取分类字段规则
- `saveCategoryRule(cat, rule)`: 保存分类规则
- `resetCategoryRule(cat)`: 重置分类规则

#### 4. 操作日志
- `getLogs()`: 获取操作日志
- `undoOperation(logId)`: 撤销操作

#### 5. 消耗看板
- `getConsumptionStats(range, useMock)`: 获取消耗统计数据

#### 6. 数据导入导出
- `exportData(payload)`: 导出CSV数据
- `readFileText()`: 读取文件内容
- `getAllInventoryExport()`: 获取所有库存导出数据
- `getAllProjectsExport()`: 获取所有项目导出数据
- `batchImportInventory(items, mode)`: 批量导入库存
- `exportBundle(options)`: 导出资源包
- `scanBundle(filePath)`: 扫描资源包
- `executeImportBundle(scanId, strategies)`: 执行资源包导入
- `generateTemplate(filePath)`: 生成导入模板

#### 7. 系统设置与资源管理
- `getStoragePath()`: 获取存储路径
- `openDataFolder()`: 打开数据文件夹
- `openFile(relativePath)`: 打开文件
- `showItemInFolder(relativePath)`: 在资源管理器中显示文件
- `saveAsset(sourcePath, group, category)`: 保存资源文件
- `saveBuffer(buffer, filename, group, category)`: 保存二进制数据
- `selectFolder()`: 选择文件夹
- `updateStoragePath(newPath)`: 更新存储路径
- `scanUnusedAssets()`: 扫描未使用资源
- `purgeUnusedAssets(files)`: 清理未使用资源
- `optimizeDatabase()`: 优化数据库
- `getAppVersion()`: 获取应用版本

#### 8. 自动备份设置
- `getAppSettings()`: 获取应用设置
- `saveAppSettings(settings)`: 保存应用设置

### `index.d.ts` - TypeScript类型定义
**功能**: 提供完整的API类型定义，确保类型安全

**包含接口**:
- `InventoryItem`: 元器件接口
- `BomItem`: BOM项目项接口
- `BomProject`: BOM项目接口
- `FilterOptions`: 过滤选项接口
- `CategoryRule`: 分类规则接口
- `OperationLog`: 操作日志接口
- `AppSettings`: 应用设置接口
- `ConsumptionData`: 消耗统计数据接口
- `ScanResult`: 资源包扫描结果接口
- `UnusedAsset`: 未使用资源接口

## 🎨 渲染进程前端 (src/renderer/src/)

### 应用入口
- `main.ts`: Vue应用初始化，路由挂载
- `App.vue`: 根组件，应用布局，主题配置
- `router/index.ts`: 路由配置

### 路由配置
```typescript
routes: [
  { path: '/', name: 'Inventory', component: Inventory },        // 库存管理
  { path: '/bom', name: 'Bom', component: BomProject },          // BOM项目管理
  { path: '/replenish', name: 'Replenish', component: ReplenishView }, // 补货监控
  { path: '/consumption', name: 'Consumption', component: Consumption }, // 消耗看板
  { path: '/data', name: 'DataCenter', component: DataCenter },  // 数据中心
  { path: '/logs', name: 'Logs', component: OperationLog },      // 操作日志
  { path: '/settings', name: 'Settings', component: SettingsView } // 系统设置
]
```

### 视图组件 (src/renderer/src/views/)

#### `Inventory.vue` - 库存管理页面
**功能**: 元器件列表展示、搜索、过滤、编辑、拖拽排序
**关键特性**:
- 分类分组显示
- 拖拽排序支持
- 批量编辑功能
- 图片/文档预览

#### `BomProject.vue` - BOM项目管理页面
**功能**: 项目创建、编辑、执行生产扣减
**关键特性**:
- 项目清单管理
- 库存关联检查
- 生产执行扣减

#### `Consumption.vue` - 消耗看板页面
**功能**: 消耗数据可视化分析
**关键特性**:
- 时间线趋势图
- 分类玫瑰图
- 热力图分析
- 消耗强度评估

#### `DataCenter.vue` - 数据中心页面
**功能**: 数据导入导出、备份恢复
**关键特性**:
- CSV导入导出
- 资源包管理
- 模板生成

#### `OperationLog.vue` - 操作日志页面
**功能**: 操作历史记录和撤销功能
**关键特性**:
- 完整操作记录
- 一键撤销功能
- 操作类型分类

#### `ReplenishView.vue` - 补货监控页面
**功能**: 低库存预警和补货提醒

#### `SettingsView.vue` - 系统设置页面
**功能**: 应用配置、备份设置、系统维护

### 公共组件 (src/renderer/src/components/)

#### 模态框组件
- `EditDialog.vue`: 元器件编辑对话框
- `BatchEditModal.vue`: 批量编辑模态框
- `BomEditModal.vue`: BOM项目编辑模态框
- `BomRunModal.vue`: BOM项目执行模态框
- `CategoryRuleModal.vue`: 分类规则配置模态框
- `CsvImportModal.vue`: CSV导入模态框
- `ExportWizardModal.vue`: 导出向导模态框
- `ImportConflictModal.vue`: 导入冲突解决模态框

#### 布局组件
- `Sidebar.vue`: 侧边栏导航
- `BottomBar.vue`: 底部导航（移动端）
- `InventoryCard.vue`: 元器件卡片组件
- `Versions.vue`: 版本信息组件

## 📊 数据模型

### 核心实体

#### InventoryItem (元器件)
```typescript
interface InventoryItem {
  id?: number
  category: string        // 分类：电阻、电容、芯片等
  name: string           // 名称/型号
  value: string          // 数值/参数
  package: string        // 封装类型
  quantity: number       // 库存数量
  location: string       // 存放位置
  min_stock?: number     // 最小库存预警
  image_paths?: string   // 图片路径(JSON数组)
  datasheet_paths?: string // 数据手册路径(JSON数组)
}
```

#### BomProject (BOM项目)
```typescript
interface BomProject {
  id?: number
  name: string           // 项目名称
  description: string    // 项目描述
  created_at?: string    // 创建时间
  items?: BomItem[]      // 项目项列表
  order_index?: number   // 排序索引
  files?: string         // 关联文件(JSON数组)
}
```

#### BomItem (BOM项目项)
```typescript
interface BomItem {
  inventory_id: number   // 元器件ID
  quantity: number       // 需求数量
  name?: string          // 元器件名称
  value?: string         // 元器件数值
  package?: string       // 元器件封装
  category?: string      // 元器件分类
  current_stock?: number // 当前库存
}
```

#### CategoryRule (分类规则)
```typescript
interface CategoryRule {
  nameLabel: string        // 名称字段标签
  namePlaceholder: string  // 名称字段提示
  valueLabel: string       // 数值字段标签
  valuePlaceholder: string // 数值字段提示
  packageLabel: string     // 封装字段标签
}
```

## ⚙️ 系统配置

### 应用设置 (AppSettings)
```typescript
interface AppSettings {
  autoBackup: boolean                // 是否启用自动备份
  backupFrequency: 'exit' | '30min' | '1h' | '4h'  // 备份频率
  backupPath: string                 // 备份路径
  maxBackups: number                 // 最大备份数量
}
```

### 默认分类规则
系统为常见元器件分类预设了字段标签：
- **电阻**: 精度/功率, 阻值
- **电容**: 耐压/材质, 容值  
- **电感**: 电流/参数, 感值
- **芯片(IC)**: 完整型号, 核心描述
- **二极管**: 参数, 型号
- **三极管**: 参数, 型号

## 🔄 数据流架构

### 通信流程
```
渲染进程 (Vue组件) → 预加载脚本 (window.api) → 主进程 (IPC Handler) → 数据库操作
```

### 状态管理
- 使用Vue 3的响应式系统进行组件状态管理
- 通过IPC通信与主进程进行数据同步
- 本地状态与数据库状态保持一致性

## 🛠️ 开发工具

### 构建命令
```bash
npm run dev          # 开发模式
npm run build        # 构建应用
npm run typecheck    # 类型检查
npm run lint         # 代码检查
npm run format       # 代码格式化
```

### 打包配置
- **electron-builder.yml**: 应用打包配置
- **electron.vite.config.ts**: Vite构建配置
- **tsconfig.json**: TypeScript配置

## 📈 性能优化

### 数据库优化
- 使用Better-SQLite3提供高性能SQLite访问
- 定期执行VACUUM优化数据库
- 索引优化查询性能

### 资源管理
- 智能资源文件清理
- 图片和文档的懒加载
- 内存泄漏防护

### 渲染优化
- Vue 3的组合式API优化组件性能
- 虚拟滚动处理大数据列表
- ECharts图表性能优化

---

**文档版本**: 1.1  
**最后更新**: 2026-02-06  
**维护者**: AI助手