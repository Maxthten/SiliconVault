import assert from 'node:assert/strict'
import {
  DEFAULT_CATEGORY_LAYOUT,
  getAvailableCategoryFields,
  moveCategoryLayoutField,
  normalizeCategoryLayout,
  serializeCategoryLayout,
  validateCategoryLayout
} from '../../src/renderer/src/utils/category-layout'

export function testCategoryLayout(): void {
  const initial = normalizeCategoryLayout(DEFAULT_CATEGORY_LAYOUT)
  assert.deepEqual(getAvailableCategoryFields(initial), [])
  assert.deepEqual(validateCategoryLayout(initial), [])

  const replaced = moveCategoryLayoutField(
    { ...initial, bottomRight: null },
    'location',
    'pool',
    'topLeft'
  )
  assert.equal(replaced.topLeft, 'location')
  assert.equal(replaced.bottomRight, null)
  assert.deepEqual(getAvailableCategoryFields(replaced), ['value'])

  const swapped = moveCategoryLayoutField(initial, 'package', 'topRight', 'topLeft')
  assert.deepEqual(swapped, {
    topLeft: 'package',
    topRight: 'value',
    bottomLeft: 'name',
    bottomRight: 'location'
  })

  const returnedToPool = moveCategoryLayoutField(initial, 'value', 'topLeft', 'pool')
  assert.equal(returnedToPool.topLeft, null)
  assert.deepEqual(getAvailableCategoryFields(returnedToPool), ['value'])

  const duplicateLegacy = normalizeCategoryLayout({
    topLeft: 'value',
    topRight: 'value',
    bottomLeft: 'name',
    bottomRight: 'unsupported'
  })
  assert.deepEqual(duplicateLegacy, {
    topLeft: 'value',
    topRight: null,
    bottomLeft: 'name',
    bottomRight: null
  })
  assert.deepEqual(getAvailableCategoryFields(duplicateLegacy), ['package', 'location'])
  assert.deepEqual(validateCategoryLayout(duplicateLegacy), [])

  assert.deepEqual(serializeCategoryLayout(returnedToPool), {
    topLeft: '',
    topRight: 'package',
    bottomLeft: 'name',
    bottomRight: 'location'
  })
}
