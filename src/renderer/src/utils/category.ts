import type { CategoryRule, InventoryItem } from '../../../shared/types'
export type { CategoryRule, InventoryItem } from '../../../shared/types'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export const LEGACY_CATEGORY_MAP: Readonly<Record<string, string>> = Object.freeze({
  '电阻': 'Resistor',
  '电容': 'Capacitor',
  '电感': 'Inductor',
  '二极管': 'Diode',
  '三极管': 'Transistor',
  '芯片(IC)': 'IC',
  '连接器': 'Connector',
  '模块': 'Module',
  '开关/按键': 'Switch',
  '其他': 'Other',
  '未分类': 'Uncategorized'
})

export const GENERIC_CATEGORY_RULE_KEY = '__generic__'

export function canonicalizeCategory(category: string): string {
  return LEGACY_CATEGORY_MAP[category] || category || 'Uncategorized'
}

export function getCategoryDisplayName(category: string, t: Translate): string {
  const canonical = canonicalizeCategory(category)
  const translationKey = `categories.${canonical}`
  const translated = t(translationKey)
  return translated !== translationKey ? translated : category || canonical
}

export function buildCategoryOptions(
  categories: Iterable<string>,
  t: Translate
): Array<{ label: string; value: string }> {
  const merged = new Map<string, { label: string; value: string }>()
  for (const rawCategory of categories) {
    if (!rawCategory) continue
    const label = getCategoryDisplayName(rawCategory, t)
    const current = merged.get(label)
    if (!current || LEGACY_CATEGORY_MAP[rawCategory]) {
      merged.set(label, { label, value: rawCategory })
    }
  }
  return Array.from(merged.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'zh-CN')
  )
}

export function getCategoryRule(
  rules: Record<string, CategoryRule>,
  category: string
): CategoryRule | undefined {
  const canonical = canonicalizeCategory(category)
  return rules[category] || rules[canonical] || rules[GENERIC_CATEGORY_RULE_KEY]
}

export function mergeInventoryGroups(
  grouped: Record<string, InventoryItem[]>,
  t: Translate
): Map<string, InventoryItem[]> {
  const merged = new Map<string, InventoryItem[]>()
  for (const [category, items] of Object.entries(grouped)) {
    const label = getCategoryDisplayName(category, t)
    const current = merged.get(label) || []
    current.push(...items)
    merged.set(label, current)
  }
  return merged
}

export function getPrimaryInventoryField(
  item: Record<string, unknown>,
  rules: Record<string, CategoryRule>,
  fallback = 'name'
): string {
  const rule = getCategoryRule(rules, String(item.category || ''))
  const layout = rule?.layout
  if (Array.isArray(layout)) return layout[0] || fallback
  return layout?.topLeft || fallback
}

export function getInventoryDisplayValue(
  item: Record<string, unknown>,
  rules: Record<string, CategoryRule>,
  fallback = ''
): string {
  const field = getPrimaryInventoryField(item, rules)
  const value = item[field]
  return String(value || item.name || fallback)
}
