# SiliconVault - AI 参考文档

> 本文档专为AI助手设计，用于快速了解项目结构、API接口和功能模块

## 项目概述

**项目类型**: Electron + Vue 3 + TypeScript 桌面应用  
**核心功能**: 电子元器件库存管理系统  
**数据库**: SQLite (Better-SQLite3)  
**架构模式**: 主进程-渲染进程分离架构

## 文件结构映射

### 1. 主进程文件 (src/main/)

#### `index.ts` - 应用入口和窗口管理
**功能**: Electron应用主入口，窗口创建，IPC通信注册
**关键API注册**:
- `get-categories`: 获取元器件分类列表
- `get-packages`: 根据分类获取封装类型
- `get-inventory`: 获取库存数据（支持过滤）
- `update-qty`: 更新元器件库存数量
- `delete-item`: 删除元器件
- `upsert-item`: 创建或更新元器件
- `get-projects`: 获取BOM项目列表
- `get-project-detail`: 获取项目详情
- `save-project`: 保存BOM项目
- `delete-project`: 删除BOM项目
- `execute-deduction`: 执行库存扣减（生产）
- `get-category-rule`: 获取分类字段规则
- `save-category-rule`: 保存分类规则
- `reset-category-rule`: 重置分类规则
- `update-sort-order`: 更新排序顺序
- `get-logs`: 获取操作日志
- `undo-operation`: 撤销操作
- `export-data`: 导出数据
- `read-file-text`: 读取文件内容
- `batch-import-inventory`: 批量导入库存
- `export-bundle`: 导出资源包
- `scan-bundle`: 扫描资源包
- `execute-import-bundle`: 执行资源包导入
- `generate-template`: 生成导入模板
- `get-storage-path`: 获取存储路径
- `open-data-folder`: 打开数据文件夹
- `open-file`: 打开文件
- `show-item-in-folder`: 在文件夹中显示文件
- `save-asset`: 保存资源文件
- `save-buffer`: 保存二进制数据
- `select-folder`: 选择文件夹
- `update-storage-path`: 更新存储路径
- `scan-unused-assets`: 扫描未使用资源
- `purge-unused-assets`: 清理未使用资源
- `optimize-database`: 优化数据库
- `get-app-version`: 获取应用版本

#### `db.ts` - 数据库操作核心
**功能**: SQLite数据库管理，数据CRUD操作
**关键类**: `DBManager`
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

**数据表结构**:
- `inventory`: 元器件库存表
- `projects`: BOM项目表
- `project_items`: 项目-元器件关联表
- `operation_logs`: 操作日志表
- `category_rules`: 分类规则表

#### `backup.ts` - 备份管理
**功能**: 数据备份、恢复、导入导出
**关键类**: `BackupManager`
**主要方法**:
- `exportBundle(options)`: 导出资源包
- `scanBundle(filePath)`: 扫描资源包
- `executeImportBundle(scanId, strategies)`: 执行导入
- `generateTemplate(filePath)`: 生成导入模板

#### `maintenance.ts` - 系统维护
**功能**: 资源清理、数据库优化
**关键类**: `MaintenanceManager`
**主要方法**:
- `scanUnusedAssets()`: 扫描未使用资源
- `purgeUnusedAssets(files)`: 清理资源
- `optimizeDatabase()`: 优化数据库

### 2. 预加载脚本 (src/preload/)

#### `index.ts` - 主进程与渲染进程通信桥梁
**功能**: 暴露安全的API给渲染进程
**暴露的API对象**: `window.api`

**API分类**:
1. **库存管理**:
   - `fetchCategories()`: 获取分类
   - `fetchPackages(category)`: 获取封装
   - `fetchInventory(filters)`: 获取库存
   - `updateQty(id, qty)`: 更新数量
   - `deleteItem(id)`: 删除项目
   - `upsertItem(data)`: 创建/更新

2. **BOM项目管理**:
   - `getProjects(query)`: 获取项目列表
   - `getProjectDetail(id)`: 获取项目详情
   - `saveProject(project)`: 保存项目
   - `deleteProject(id)`: 删除项目
   - `executeDeduction(items)`: 执行扣减

3. **排序与规则**:
   - `updateSortOrder(table, ids)`: 更新排序
   - `getCategoryRule(cat)`: 获取分类规则
   - `saveCategoryRule(cat, rule)`: 保存规则
   - `resetCategoryRule(cat)`: 重置规则

4. **操作日志**:
   - `getLogs()`: 获取日志
   - `undoOperation(logId)`: 撤销操作

5. **数据导入导出**:
   - `exportData(payload)`: 导出数据
   - `readFileText()`: 读取文件
   - `getAllInventoryExport()`: 获取库存导出数据
   - `getAllProjectsExport()`: 获取项目导出数据
   - `batchImportInventory(items, mode)`: 批量导入
   - `exportBundle(options)`: 导出资源包
   - `scanBundle(filePath)`: 扫描资源包
   - `executeImportBundle(scanId, strategies)`: 执行导入
   - `generateTemplate(filePath)`: 生成模板

6. **系统设置与资源管理**:
   - `getStoragePath()`: 获取存储路径
   - `openDataFolder()`: 打开数据文件夹
   - `openFile(relativePath)`: 打开文件
   - `showItemInFolder(relativePath)`: 显示文件位置
   - `saveAsset(sourcePath, group, category)`: 保存资源
   - `saveBuffer(buffer, filename, group, category)`: 保存二进制
   - `selectFolder()`: 选择文件夹
   - `updateStoragePath(newPath)`: 更新存储路径
   - `scanUnusedAssets()`: 扫描未使用资源
   - `purgeUnusedAssets(files)`: 清理资源
   - `optimizeDatabase()`: 优化数据库
   - `getAppVersion()`: 获取版本

#### `index.d.ts` - TypeScript类型定义
**功能**: 提供完整的API类型定义
**包含接口**:
- `InventoryItem`: 元器件接口
- `BomProject`: BOM项目接口
- `BomItem`: BOM项目项接口
- `FilterOptions`: 过滤选项接口
- `CategoryRule`: 分类规则接口
- `OperationLog`: 操作日志接口

### 3. 渲染进程前端 (src/renderer/src/)

#### `main.ts` - Vue应用入口
**功能**: Vue应用初始化，路由挂载

#### `App.vue` - 根组件
**功能**: 应用布局，主题配置，全局样式
**使用组件**:
- `Sidebar`: 侧边栏导航
- `BottomBar`: 底部导航（移动端）

#### `router/index.ts` - 路由配置
**路由映射**:
- `/` → `Inventory.vue`: 库存管理
- `/bom` → `BomProject.vue`: BOM项目管理
- `/replenish` → `ReplenishView.vue`: 补货监控
- `/logs` → `OperationLog.vue`: 操作日志
- `/data` → `DataCenter.vue`: 数据中心
- `/settings` → `SettingsView.vue`: 系统设置

### 4. 视图组件 (src/renderer/src/views/)

#### `Inventory.vue` - 库存管理页面
**功能**: 元器件列表展示、搜索、过滤、编辑
**关键功能**:
- 分类分组显示
- 拖拽排序
- 批量编辑
- 图片/文档预览
**使用组件**:
- `InventoryCard`: 元器件卡片
- `EditDialog`: 编辑对话框
- `BatchEditModal`: 批量编辑模态框

#### `BomProject.vue` - BOM项目管理页面
**功能**: BOM项目创建、编辑、执行生产
**使用组件**:
- `BomEditModal`: BOM编辑模态框
- `BomRunModal`: 生产执行模态框

#### `ReplenishView.vue` - 补货监控页面
**功能**: 低库存预警，补货建议
**显示逻辑**:
- 红色区域：严重耗尽（立即采购）
- 黄色区域：低库存预警（建议补充）

#### `OperationLog.vue` - 操作日志页面
**功能**: 操作历史记录，撤销功能
**日志类型**: CREATE, UPDATE, DELETE, STOCK, IMPORT, EXPORT

#### `DataCenter.vue` - 数据中心页面
**功能**: 数据导入导出，备份恢复
**使用组件**:
- `ExportWizardModal`: 导出向导
- `CsvImportModal`: CSV导入
- `ImportConflictModal`: 导入冲突处理

#### `SettingsView.vue` - 系统设置页面
**功能**: 应用配置，系统维护
**包含功能**:
- 存储路径设置
- 数据迁移
- 资源清理
- 数据库优化
- 关于信息

### 5. 通用组件 (src/renderer/src/components/)

#### `InventoryCard.vue` - 元器件卡片组件
**功能**: 单个元器件展示，库存操作
**特性**:
- 图片轮播预览
- 文档下拉选择
- 库存数量调整
- 编辑/删除操作

#### `EditDialog.vue` - 编辑对话框组件
**功能**: 元器件创建/编辑表单
**表单字段**:
- 分类、名称、数值、封装
- 库存数量、位置、最小库存
- 图片上传、文档上传

#### `BatchEditModal.vue` - 批量编辑模态框
**功能**: 批量库存数量调整
**操作模式**:
- 增加模式
- 减少模式（允许负库存）

#### `BomEditModal.vue` - BOM编辑模态框
**功能**: BOM项目编辑，元器件添加
**特性**:
- 元器件搜索过滤
- 拖拽排序
- 附件上传

#### `BomRunModal.vue` - 生产执行模态框
**功能**: BOM生产执行，库存扣减
**安全机制**:
- 库存充足性检查
- 负库存警告
- 二次确认

#### `ExportWizardModal.vue` - 导出向导模态框
**功能**: 数据导出配置
**导出格式**:
- CSV表格
- 资源包(.svdata)

### 6. 配置文件

#### `package.json` - 项目配置
**关键脚本**:
- `dev`: 开发模式
- `build`: 构建应用
- `build:win/mac/linux`: 平台特定构建
- `typecheck`: 类型检查
- `lint`: 代码检查
- `format`: 代码格式化

**主要依赖**:
- `electron`: Electron框架
- `vue`: Vue 3框架
- `naive-ui`: UI组件库
- `better-sqlite3`: 数据库
- `vue-router`: 路由管理
- `vue-draggable-plus`: 拖拽功能

#### `electron.vite.config.ts` - 构建配置
**配置项**:
- 主进程、预加载、渲染进程分别配置
- 别名配置：`@renderer` → `src/renderer/src`
- 端口配置：开发服务器端口3000

#### `tsconfig.json` - TypeScript配置
**引用配置**:
- `tsconfig.node.json`: Node.js环境配置
- `tsconfig.web.json`: Web环境配置

## 数据模型

### 核心接口定义

```typescript
interface InventoryItem {
  id?: number
  category: string        // 分类：电阻、电容等
  name: string           // 名称/型号
  value: string          // 数值/参数
  package: string        // 封装类型
  quantity: number       // 库存数量
  location: string       // 存放位置
  min_stock?: number     // 最小库存阈值
  image_paths?: string   // 图片路径JSON
  datasheet_paths?: string // 文档路径JSON
}

interface BomProject {
  id?: number
  name: string           // 项目名称
  description: string    // 项目描述
  created_at?: string    // 创建时间
  items?: BomItem[]      // 元器件列表
  order_index?: number   // 排序索引
  files?: string         // 附件文件JSON
}

interface BomItem {
  inventory_id: number   // 元器件ID
  quantity: number       // 用量
  name?: string          // 元器件名称
  value?: string         // 元器件数值
  package?: string       // 封装类型
  category?: string      // 分类
  current_stock?: number // 当前库存
}
```

## 开发工具链

### 构建命令
```bash
pnpm dev          # 开发模式
pnpm build        # 构建应用
pnpm typecheck    # 类型检查
pnpm lint         # 代码检查
pnpm format       # 代码格式化
```

### 开发环境要求
- Node.js 18+
- pnpm 8+ (推荐)
- TypeScript 5.9+

## 架构特点

1. **模块化设计**: 每个功能模块独立，便于维护
2. **类型安全**: 完整的TypeScript类型定义
3. **响应式UI**: 基于Vue 3的响应式设计
4. **本地存储**: SQLite数据库，数据安全可靠
5. **跨平台**: Electron框架支持Windows/macOS/Linux
6. **扩展性强**: 清晰的API接口，易于功能扩展

## 使用场景

AI助手可以通过以下方式使用此参考文档：

1. **功能查询**: 快速了解特定功能的实现位置
2. **API调用**: 查找可用的API接口和参数
3. **代码修改**: 了解文件结构和依赖关系
4. **问题排查**: 定位功能模块和数据处理流程
5. **功能扩展**: 基于现有架构添加新功能

---

*本文档将持续更新，反映项目的最新状态*