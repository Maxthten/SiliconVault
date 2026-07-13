import type { CategoryRule } from './category'

let cachedRules: Record<string, CategoryRule> | null = null
let pendingRules: Promise<Record<string, CategoryRule>> | null = null

export async function loadCategoryRules(force = false): Promise<Record<string, CategoryRule>> {
  if (force) invalidateCategoryRules()
  if (cachedRules) return cachedRules
  if (!pendingRules) {
    pendingRules = window.api.getAllCategoryRules()
      .then(rules => {
        cachedRules = rules
        return rules
      })
      .finally(() => {
        pendingRules = null
      })
  }
  return pendingRules
}

export function invalidateCategoryRules(): void {
  cachedRules = null
  pendingRules = null
}
