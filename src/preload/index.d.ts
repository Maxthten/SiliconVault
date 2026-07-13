/*
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 */
import type { ElectronAPI } from '@electron-toolkit/preload'
import type { SiliconVaultAPI } from '../shared/types'

export type * from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: SiliconVaultAPI
  }
}
