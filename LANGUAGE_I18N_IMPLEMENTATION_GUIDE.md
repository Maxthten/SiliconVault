# SiliconVault 多语言国际化实施指南

> 深度技术分析文档 - 专为AI助手和开发者设计

## 📋 文档说明

**文档目的**: 为AI助手和开发者提供详细的国际化实施指导
**适用对象**: AI代码助手、开发者、技术团队
**文档类型**: 技术实施指南
**更新日期**: 2026-02-08

## 🔍 项目语言现状分析

### 当前语言实现状态
- **单一语言**: 仅支持中文
- **硬编码文本**: 所有界面文本直接嵌入代码中
- **缺乏基础设施**: 无国际化框架和工具

### 文本分布统计

| 文本类型 | 出现次数 | 主要文件 | 示例 |
|---------|---------|---------|------|
| 消息提示 | 45次 | 所有组件 | `message.success('已删除')` |
| 按钮文本 | 28次 | 模态框、对话框 | `删除`、`取消`、`确认` |
| 标签文本 | 35次 | 表单、输入框 | `placeholder="分类"` |
| 界面文本 | 62次 | 页面标题、描述 | `系统设置`、`库存管理` |
| 动态文本 | 15次 | 操作日志、状态 | `新增: ${displayName}` |

## 📁 文件结构和依赖关系

### 核心文件清单

```
src/renderer/src/
├── App.vue                    # 应用根组件
├── router/index.ts            # 路由配置
├── views/                     # 页面组件
│   ├── Inventory.vue          # 库存管理
│   ├── BomProject.vue         # BOM项目管理
│   ├── Consumption.vue        # 消耗看板
│   ├── ReplenishView.vue      # 补货监控
│   ├── OperationLog.vue       # 操作日志
│   ├── DataCenter.vue         # 数据中心
│   └── SettingsView.vue       # 系统设置
└── components/                # 可复用组件
    ├── ImportConflictModal.vue # 导入冲突解决
    ├── ExportWizardModal.vue  # 导出向导
    ├── BomEditModal.vue       # BOM编辑
    ├── CategoryRuleModal.vue  # 分类规则
    ├── EditDialog.vue         # 编辑对话框
    ├── BatchEditModal.vue     # 批量编辑
    ├── Sidebar.vue            # 侧边栏导航
    └── BottomBar.vue          # 底部标签栏
```

## 🔧 国际化技术方案

### 1. 基础架构设计

#### 语言包结构
```typescript
// locales/zh-CN.json
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "confirm": "确认",
    "search": "搜索"
  },
  "inventory": {
    "title": "库存管理",
    "category": "分类",
    "package": "封装",
    "deleteConfirm": "删除后无法恢复，确定吗？"
  },
  "messages": {
    "success": {
      "deleted": "已删除",
      "saved": "保存成功",
      "exported": "导出成功"
    },
    "error": {
      "loadFailed": "加载失败",
      "deleteFailed": "删除失败"
    }
  }
}

// locales/en-US.json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel", 
    "delete": "Delete",
    "confirm": "Confirm",
    "search": "Search"
  },
  "inventory": {
    "title": "Inventory Management",
    "category": "Category",
    "package": "Package",
    "deleteConfirm": "Cannot be recovered after deletion, are you sure?"
  }
}
```

#### 国际化工具配置
```typescript
// utils/i18n.ts
export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export const t = i18n.global.t
export const useI18n = () => {
  const { t, locale } = i18n.global
  return { t, locale }
}
```

### 2. 消息提示系统改造

```typescript
// utils/message.ts
import { useMessage } from 'naive-ui'
import { useI18n } from './i18n'

const message = useMessage()
const { t } = useI18n()

export const useI18nMessage = () => {
  return {
    success: (key: string, params?: any) => {
      message.success(t(`messages.success.${key}`, params))
    },
    error: (key: string, params?: any) => {
      message.error(t(`messages.error.${key}`, params))
    },
    warning: (key: string, params?: any) => {
      message.warning(t(`messages.warning.${key}`, params))
    }
  }
}
```

## 📝 详细文本映射表

### 通用文本 (common)

| 中文文本 | 英文翻译 | 使用位置 |
|---------|---------|---------|
| 保存 | Save | 按钮、操作 |
| 取消 | Cancel | 按钮、操作 |
| 删除 | Delete | 按钮、操作 |
| 确认 | Confirm | 按钮、操作 |
| 搜索 | Search | 输入框、功能 |
| 分类 | Category | 筛选、标签 |
| 封装 | Package | 筛选、标签 |
| 位置 | Location | 字段、标签 |

### 库存管理 (inventory)

| 中文文本 | 英文翻译 | 使用位置 |
|---------|---------|---------|
| 库存管理 | Inventory Management | 页面标题 |
| 全部分类 | All Categories | 筛选选项 |
| 全部封装 | All Packages | 筛选选项 |
| 暂无数据 | No Data | 空状态 |
| 加载失败 | Load Failed | 错误提示 |

### BOM项目管理 (bom)

| 中文文本 | 英文翻译 | 使用位置 |
|---------|---------|---------|
| 项目 BOM | Project BOM | 页面标题 |
| 搜索项目 | Search Projects | 搜索框 |
| 暂无项目 | No Projects | 空状态 |
| 删除项目 | Delete Project | 操作 |
| 确定要删除这个 BOM 吗？ | Are you sure to delete this BOM? | 确认提示 |

### 消息提示 (messages)

| 中文文本 | 英文翻译 | 类型 |
|---------|---------|-----|
| 已删除 | Deleted | success |
| 保存成功 | Saved Successfully | success |
| 导出成功 | Exported Successfully | success |
| 加载失败 | Load Failed | error |
| 删除失败 | Delete Failed | error |
| 请至少选择一项 | Please select at least one item | warning |

## 🔄 组件级实施指南

### 1. 基础组件改造示例

#### 改造前
```vue
<!-- Inventory.vue -->
<n-select placeholder="分类" />
<n-select placeholder="封装" />
<n-input placeholder="搜索..." />
<n-button @click="handleDelete">删除</n-button>
```

#### 改造后
```vue
<!-- Inventory.vue -->
<script setup lang="ts">
import { useI18n } from '../utils/i18n'

const { t } = useI18n()
</script>

<template>
  <n-select :placeholder="t('inventory.category')" />
  <n-select :placeholder="t('inventory.package')" />
  <n-input :placeholder="t('common.search')" />
  <n-button @click="handleDelete">{{ t('common.delete') }}</n-button>
</template>
```

### 2. 消息提示改造示例

#### 改造前
```typescript
// Inventory.vue
message.success('已删除')
message.error('加载失败')
message.warning('请至少选择一项')
```

#### 改造后
```typescript
// Inventory.vue
import { useI18nMessage } from '../utils/message'

const { success, error, warning } = useI18nMessage()

success('deleted')
error('loadFailed')
warning('selectAtLeastOne')
```

### 3. 动态文本处理示例

#### 改造前
```typescript
// OperationLog.vue
case 'CREATE': return `新增: ${displayName}`
case 'UPDATE': return `修改: ${displayName}`
case 'DELETE': return `删除: ${displayName}`
```

#### 改造后
```typescript
// OperationLog.vue
import { useI18n } from '../utils/i18n'

const { t } = useI18n()

case 'CREATE': return `${t('operation.create')}: ${displayName}`
case 'UPDATE': return `${t('operation.update')}: ${displayName}`
case 'DELETE': return `${t('operation.delete')}: ${displayName}`
```

## 🛠️ 实施步骤和优先级

### 第一阶段：基础设施 (优先级: 高)

1. **创建语言包文件**
   ```bash
   mkdir -p src/renderer/src/locales
   touch src/renderer/src/locales/zh-CN.json
   touch src/renderer/src/locales/en-US.json
   ```

2. **配置国际化工具**
   ```typescript
   // utils/i18n.ts
   export const i18n = createI18n({...})
   ```

3. **集成到主应用**
   ```typescript
   // main.ts
   import { i18n } from './utils/i18n'
   app.use(i18n)
   ```

### 第二阶段：核心组件 (优先级: 中)

1. **改造基础组件**
   - Inventory.vue
   - BomProject.vue
   - SettingsView.vue

2. **改造消息提示**
   - 所有组件中的message调用

3. **改造路由配置**
   ```typescript
   // router/index.ts
   const routes = [
     { path: '/', component: Inventory, meta: { title: 'inventory.title' } }
   ]
   ```

### 第三阶段：复杂组件 (优先级: 低)

1. **改造模态框组件**
   - ImportConflictModal.vue
   - ExportWizardModal.vue
   - BomEditModal.vue

2. **改造动态文本**
   - OperationLog.vue
   - ReplenishView.vue

3. **添加语言切换器**
   ```vue
   <!-- LanguageSwitcher.vue -->
   <n-dropdown :options="languageOptions" @select="handleLanguageChange">
     <n-button>{{ currentLanguage.name }}</n-button>
   </n-dropdown>
   ```

## 📋 详细文件修改清单

### 需要创建的新文件

1. `src/renderer/src/utils/i18n.ts` - 国际化工具
2. `src/renderer/src/utils/message.ts` - 消息提示工具
3. `src/renderer/src/locales/zh-CN.json` - 中文语言包
4. `src/renderer/src/locales/en-US.json` - 英文语言包
5. `src/renderer/src/components/LanguageSwitcher.vue` - 语言切换组件

### 需要修改的现有文件

| 文件路径 | 修改内容 | 优先级 |
|---------|---------|--------|
| `src/renderer/src/main.ts` | 集成i18n | 高 |
| `src/renderer/src/App.vue` | 添加语言切换器 | 中 |
| `src/renderer/src/router/index.ts` | 路由标题国际化 | 高 |
| `src/renderer/src/views/Inventory.vue` | 文本国际化 | 高 |
| `src/renderer/src/views/BomProject.vue` | 文本国际化 | 高 |
| `src/renderer/src/views/SettingsView.vue` | 文本国际化 | 高 |
| 所有其他组件文件 | 文本国际化 | 中/低 |

## 🔍 技术细节和注意事项

### 1. 复数处理
```typescript
// 中文复数处理
t('inventory.items', { count: 5 }) // "5 个项目"

// 英文复数处理
t('inventory.items', { count: 5 }) // "5 items"
t('inventory.items', { count: 1 }) // "1 item"
```

### 2. 参数化文本
```typescript
// 动态参数
t('messages.importResult', { 
  success: res.success, 
  failed: res.failed 
})
// 中文: "导入完成：成功 {success} 条，失败 {failed} 条"
// 英文: "Import completed: {success} succeeded, {failed} failed"
```

### 3. 嵌套键支持
```typescript
// 嵌套键访问
t('bom.operations.delete.confirm')
// 对应语言包结构:
// {
//   "bom": {
//     "operations": {
//       "delete": {
//         "confirm": "确定要删除吗？"
//       }
//     }
//   }
// }
```

### 4. 回退机制
```typescript
// 键不存在时的回退行为
t('non.existent.key') // 返回键名本身: "non.existent.key"
// 或使用默认值
t('non.existent.key', '默认文本')
```

## 🧪 测试和验证

### 测试用例设计

1. **语言切换测试**
   - 切换中英文界面
   - 验证所有文本正确翻译
   - 检查布局是否正常

2. **动态文本测试**
   - 测试参数化文本
   - 测试复数处理
   - 测试嵌套键访问

3. **边界情况测试**
   - 键不存在时的回退
   - 特殊字符处理
   - 长文本显示

### 验证清单

- [ ] 所有静态文本已国际化
- [ ] 所有消息提示已国际化
- [ ] 动态文本正确处理
- [ ] 语言切换功能正常
- [ ] 界面布局无异常
- [ ] 性能无显著下降

## 🔮 扩展性考虑

### 支持更多语言
```typescript
// 添加日语支持
const languages = [
  { code: 'zh-CN', name: '中文', nativeName: '简体中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ja-JP', name: '日本語', nativeName: '日本語' }
]
```

### RTL语言支持
```css
/* 支持阿拉伯语等从右到左语言 */
[dir="rtl"] .container {
  text-align: right;
  direction: rtl;
}
```

### 日期时间格式化
```typescript
// 不同语言的日期格式
const dateFormats = {
  'zh-CN': 'YYYY年MM月DD日',
  'en-US': 'MM/DD/YYYY',
  'ja-JP': 'YYYY年MM月DD日'
}
```

## 📞 技术支持

### 常见问题解决

1. **文本不显示**
   - 检查键名是否正确
   - 验证语言包加载
   - 检查i18n配置

2. **翻译不完整**
   - 检查语言包完整性
   - 验证键名映射
   - 检查回退机制

3. **性能问题**
   - 检查语言包大小
   - 验证懒加载机制
   - 检查缓存策略

### 调试工具

```typescript
// 调试模式
const { t, te } = useI18n()

// 检查键是否存在
if (!te('some.key')) {
  console.warn('Translation key not found: some.key')
}

// 获取所有可用键
console.log(Object.keys(i18n.global.messages['zh-CN']))
```

---

**文档版本**: v2.0  
**创建日期**: 2026-02-08  
**适用版本**: SiliconVault v1.2.0+  
**维护状态**: 持续更新

> 本文档专为AI助手设计，提供详细的技术实施指导，确保国际化改造的顺利进行。