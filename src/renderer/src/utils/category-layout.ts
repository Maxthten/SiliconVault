export const CATEGORY_FIELD_KEYS = ['value', 'name', 'package', 'location'] as const
export type CategoryFieldKey = (typeof CATEGORY_FIELD_KEYS)[number]

export const CATEGORY_LAYOUT_SLOTS = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight'
] as const
export type CategoryLayoutSlot = (typeof CATEGORY_LAYOUT_SLOTS)[number]
export type CategoryLayoutTarget = CategoryLayoutSlot | 'pool'

export interface CategoryLayout {
  topLeft: CategoryFieldKey | null
  topRight: CategoryFieldKey | null
  bottomLeft: CategoryFieldKey | null
  bottomRight: CategoryFieldKey | null
}

export const DEFAULT_CATEGORY_LAYOUT: CategoryLayout = {
  topLeft: 'value',
  topRight: 'package',
  bottomLeft: 'name',
  bottomRight: 'location'
}

export function isCategoryFieldKey(value: unknown): value is CategoryFieldKey {
  return typeof value === 'string' && CATEGORY_FIELD_KEYS.includes(value as CategoryFieldKey)
}

function readLayoutValue(
  input: Record<string, unknown>,
  slot: CategoryLayoutSlot,
  fallback: CategoryLayout
): unknown {
  return Object.prototype.hasOwnProperty.call(input, slot) ? input[slot] : fallback[slot]
}

export function normalizeCategoryLayout(
  input: unknown,
  fallback: CategoryLayout = DEFAULT_CATEGORY_LAYOUT
): CategoryLayout {
  let source: Record<string, unknown>

  if (Array.isArray(input)) {
    source = {
      topLeft: input[0] ?? fallback.topLeft,
      topRight: fallback.topRight,
      bottomLeft: input[1] ?? fallback.bottomLeft,
      bottomRight: fallback.bottomRight
    }
  } else if (input && typeof input === 'object') {
    source = input as Record<string, unknown>
  } else {
    source = { ...fallback }
  }

  const used = new Set<CategoryFieldKey>()
  const normalized = {} as CategoryLayout

  for (const slot of CATEGORY_LAYOUT_SLOTS) {
    const candidate = readLayoutValue(source, slot, fallback)
    if (isCategoryFieldKey(candidate) && !used.has(candidate)) {
      normalized[slot] = candidate
      used.add(candidate)
    } else {
      normalized[slot] = null
    }
  }

  return normalized
}

export function getAvailableCategoryFields(layout: CategoryLayout): CategoryFieldKey[] {
  const used = new Set(
    CATEGORY_LAYOUT_SLOTS
      .map((slot) => layout[slot])
      .filter((field): field is CategoryFieldKey => field !== null)
  )
  return CATEGORY_FIELD_KEYS.filter((field) => !used.has(field))
}

export function findCategoryFieldSlot(
  layout: CategoryLayout,
  field: CategoryFieldKey
): CategoryLayoutSlot | null {
  return CATEGORY_LAYOUT_SLOTS.find((slot) => layout[slot] === field) ?? null
}

export function moveCategoryLayoutField(
  current: CategoryLayout,
  field: CategoryFieldKey,
  source: CategoryLayoutTarget,
  target: CategoryLayoutTarget
): CategoryLayout {
  const next = normalizeCategoryLayout(current)
  const actualSource = findCategoryFieldSlot(next, field) ?? source

  if (target === 'pool') {
    if (actualSource !== 'pool' && next[actualSource] === field) {
      next[actualSource] = null
    }
    return next
  }

  if (actualSource === target) return next

  const displacedField = next[target]
  next[target] = field

  if (actualSource !== 'pool') {
    next[actualSource] = displacedField
  } else {
    const duplicateSlot = CATEGORY_LAYOUT_SLOTS.find(
      (slot) => slot !== target && next[slot] === field
    )
    if (duplicateSlot) next[duplicateSlot] = displacedField
  }

  return normalizeCategoryLayout(next, {
    topLeft: null,
    topRight: null,
    bottomLeft: null,
    bottomRight: null
  })
}

export function validateCategoryLayout(layout: CategoryLayout): string[] {
  const errors: string[] = []
  const used = new Set<CategoryFieldKey>()

  for (const slot of CATEGORY_LAYOUT_SLOTS) {
    const field = layout[slot]
    if (field === null) continue
    if (!isCategoryFieldKey(field)) {
      errors.push(`Invalid field in ${slot}`)
      continue
    }
    if (used.has(field)) errors.push(`Duplicate field: ${field}`)
    used.add(field)
  }

  if (used.size + getAvailableCategoryFields(layout).length !== CATEGORY_FIELD_KEYS.length) {
    errors.push('Category fields are incomplete')
  }

  return errors
}

export function serializeCategoryLayout(layout: CategoryLayout): Record<CategoryLayoutSlot, string> {
  return {
    topLeft: layout.topLeft ?? '',
    topRight: layout.topRight ?? '',
    bottomLeft: layout.bottomLeft ?? '',
    bottomRight: layout.bottomRight ?? ''
  }
}
