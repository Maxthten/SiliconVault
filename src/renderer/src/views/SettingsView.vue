<!--
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue' 
import { 
  NButton, NIcon, NInput, NInputGroup, useMessage, NModal, NAvatar, NDivider, NCard, NStatistic,
  NSwitch, NSelect, NInputNumber, NCollapseTransition, NSpace
} from 'naive-ui'
import { 
  FolderOpenOutline, ArrowForwardCircleOutline, 
  SaveOutline, InformationCircleOutline,
  LogoGithub, HeartOutline, CodeSlashOutline, BookOutline,
  TrashBinOutline, LeafOutline, ScanOutline,
  CloudUploadOutline, TimeOutline, ColorPaletteOutline, FlashOutline,
  ShieldCheckmarkOutline
} from '@vicons/ionicons5'

import localAvatar from '@renderer/assets/icon.png'
import { DEFAULT_ANIMATION, ANIMATION_OPTIONS } from '@renderer/config/animations'
import { useI18n } from '../utils/i18n' 

const { t, locale } = useI18n()
const message = useMessage()

// 语言选项
const langOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' }
]

// 恢复使用配置文件中的动画选项
const transitionOptions = ANIMATION_OPTIONS

const backupFreqOptions = [
  { label: t('settings.storage.freqExit'), value: 'exit' },
  { label: t('settings.storage.freq30m'), value: '30min' },
  { label: t('settings.storage.freq1h'), value: '1h' },
  { label: t('settings.storage.freq4h'), value: '4h' }
]

const APP_CONFIG = {
  appName: 'SiliconVault',
  autoVersion: true, 
  manualVersion: '', 
  developerName: 'Maxton Niu', 
  developerDesc: 'Attention Is All You Need',
  avatarUrl: localAvatar,
  links: {
    blog: 'https://zh.maxtonniu.com/',
    github: 'https://github.com/Maxthten/SiliconVault',
  },
  sponsor: {
    enable: false,
    mode: 'folder', 
    url: '', 
  }
}

const currentPath = ref('')
const newPath = ref('')
const displayVersion = ref('Loading...')
const isMigrating = ref(false)
const showConfirm = ref(false)
const isInitialized = ref(false) 

const uiSettings = ref({
  transitionName: DEFAULT_ANIMATION
})

const backupSettings = ref({
  autoBackup: false,
  backupFrequency: 'exit',
  backupPath: '',
  maxBackups: 5
})

const scanResult = ref<any>(null)
const isScanning = ref(false)
const isPurging = ref(false)
const isOptimizing = ref(false)
const showScanModal = ref(false)

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const init = async () => {
  try {
    const path = await window.api.getStoragePath()
    currentPath.value = path
    newPath.value = path 

    const settings = await window.api.getAppSettings()
    if (settings) {
      backupSettings.value = settings
    }

    const savedTransition = localStorage.getItem('ui-transition')
    if (savedTransition) {
      uiSettings.value.transitionName = savedTransition
    } else {
      uiSettings.value.transitionName = DEFAULT_ANIMATION
    }

    if (APP_CONFIG.autoVersion) {
      const ver = await window.api.getAppVersion()
      displayVersion.value = `Version ${ver} (Beta)`
    } else {
      displayVersion.value = APP_CONFIG.manualVersion
    }
  } catch (e) {
    message.error('Init failed')
  } finally {
    setTimeout(() => {
      isInitialized.value = true
    }, 100)
  }
}

onUnmounted(() => {
  message.destroyAll()
})

const handleLangChange = (val: string) => {
  // 类型断言
  locale.value = val as 'zh-CN' | 'en-US'
  localStorage.setItem('app_language', val)
  message.success(t('settings.messages.langChanged'))
}

watch(() => uiSettings.value.transitionName, (newVal) => {
  if (!isInitialized.value) return 
  localStorage.setItem('ui-transition', newVal)
  window.dispatchEvent(new Event('ui-transition-changed'))
  message.success(t('settings.messages.saved'), { duration: 1500 })
})

watch(backupSettings, async (newVal) => {
  if (!isInitialized.value) return 
  try {
    await window.api.saveAppSettings(JSON.parse(JSON.stringify(newVal)))
  } catch (e) {
    console.error(e)
  }
}, { deep: true })

const handleSelectBackupFolder = async () => {
  const path = await window.api.selectFolder()
  if (path) {
    backupSettings.value.backupPath = path
  }
}

const openLink = (url: string) => {
  if (url) window.open(url, '_blank')
}

const handleSponsor = async () => {
  await window.api.openDataFolder()
  message.info(t('settings.messages.pathSelected'))
}

const handleSelectFolder = async () => {
  const path = await window.api.selectFolder()
  if (path) {
    newPath.value = path
  }
}

const preCheckMigration = () => {
  if (newPath.value === currentPath.value) {
    message.warning(t('settings.messages.opFailed'))
    return
  }
  showConfirm.value = true
}

const executeMigration = async () => {
  showConfirm.value = false
  isMigrating.value = true
  const hideLoading = message.loading(t('settings.advanced.execute') + '...', { duration: 0 })
  
  try {
    await window.api.updateStoragePath(newPath.value)
    hideLoading.destroy()
    message.success(t('settings.messages.saved'))
  } catch (e) {
    hideLoading.destroy()
    message.error(t('settings.messages.opFailed'))
    isMigrating.value = false
  }
}

const handleScan = async () => {
  isScanning.value = true
  try {
    const res = await window.api.scanUnusedAssets()
    scanResult.value = res
    showScanModal.value = true
  } catch (e:any) {
    message.error(`${t('settings.messages.opFailed')}: ${e.message || 'Error'}`)
  } finally {
    isScanning.value = false
  }
}

const executePurge = async () => {
  if (!scanResult.value || scanResult.value.items.length === 0) return
  isPurging.value = true
  const filesToDelete = scanResult.value.items.map(i => i.relativePath)
  try {
    const res = await window.api.purgeUnusedAssets(filesToDelete)
    message.success(`${t('settings.messages.saved')} (${formatSize(res.freedSpace)})`)
    showScanModal.value = false
    scanResult.value = null 
  } catch (e) {
    message.error(t('settings.messages.opFailed'))
  } finally {
    isPurging.value = false
  }
}

const handleOptimize = async () => {
  isOptimizing.value = true
  try {
    await window.api.optimizeDatabase()
    message.success(t('settings.messages.vacuumSuccess'))
  } catch (e:any) {
    message.error(`${t('settings.messages.opFailed')}: ${e.message}`)
  } finally {
    isOptimizing.value = false
  }
}

onMounted(init)
</script>

<template>
  <div class="settings-page">
    
    <div class="header">
      <h1 class="title">{{ t('settings.title') }}</h1>
      <p class="subtitle">{{ t('settings.subtitle') }}</p>
    </div>

    <div class="section">
      <div class="section-title">
        <n-icon :component="ColorPaletteOutline" />
        <span>{{ t('settings.groups.interface') }}</span>
      </div>
      
      <div class="ui-panel">
        <div class="form-grid">
          
          <div class="form-item">
            <div class="label">{{ t('settings.language') }}</div>
            <n-select 
              v-model:value="locale" 
              :options="langOptions" 
              @update:value="handleLangChange"
              :placeholder="t('settings.language')"
            />
            <div class="sub-label">{{ t('settings.languageDesc') }}</div>
          </div>

          <div class="form-item">
            <div class="label">{{ t('settings.appearance.animation') }}</div>
            <n-select 
              v-model:value="uiSettings.transitionName" 
              :options="transitionOptions" 
              :placeholder="t('settings.appearance.animationPlaceholder')"
            />
            <div class="sub-label">
              <n-icon :component="FlashOutline" style="vertical-align: middle; margin-right: 4px;" />
              {{ t('settings.appearance.animationDesc') }}
            </div>
          </div>

        </div>
      </div>
    </div>

    <div class="section" style="margin-top: 40px;">
      <div class="section-title">
        <n-icon :component="SaveOutline" />
        <span>{{ t('settings.groups.storage') }}</span>
      </div>
      
      <div class="path-card">
        <div class="path-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="path-label">{{ t('settings.storage.currentLocation') }}</span>
        </div>
        <div class="path-body">
          {{ currentPath }}
        </div>
        <div class="path-footer">
          <n-icon :component="InformationCircleOutline" />
          <span>{{ t('settings.storage.locationDesc') }}</span>
        </div>
      </div>

      <div class="action-area">
        <div class="action-label">{{ t('settings.storage.path') }}</div>
        <n-input-group class="input-group">
          <n-input 
            v-model:value="newPath" 
            readonly 
            :placeholder="t('settings.storage.changePath')" 
            class="path-input"
            size="large"
          />
          <n-button type="primary" secondary size="large" @click="handleSelectFolder">
            <template #icon><n-icon :component="FolderOpenOutline" /></template>
            {{ t('common.browse') }}
          </n-button>
        </n-input-group>

        <div class="migrate-btn-wrapper" :class="{ 'visible': newPath !== currentPath }">
          <n-button 
            type="warning" 
            size="large"
            block
            :loading="isMigrating"
            @click="preCheckMigration"
            class="migrate-btn"
          >
            <template #icon><n-icon :component="ArrowForwardCircleOutline" /></template>
            {{ t('settings.dialogs.migrationConfirmBtn') }}
          </n-button>
        </div>
      </div>
    </div>

    <div class="section" style="margin-top: 40px;">
      <div class="section-title">
        <n-icon :component="CloudUploadOutline" />
        <span>{{ t('settings.storage.autoBackup') }}</span>
      </div>

      <div class="backup-panel">
        <div class="backup-header">
          <div class="backup-info">
            <div class="b-title">{{ t('settings.storage.autoBackup') }}</div>
            <div class="b-desc">{{ t('settings.storage.backupDesc') }}</div>
          </div>
          <n-switch v-model:value="backupSettings.autoBackup" size="large" />
        </div>

        <n-collapse-transition :show="backupSettings.autoBackup">
          <div class="backup-body">
            <n-divider class="backup-divider" />
            
            <div class="form-grid">
              <div class="form-item">
                <div class="label">{{ t('settings.storage.frequency') }}</div>
                <n-select 
                  v-model:value="backupSettings.backupFrequency" 
                  :options="backupFreqOptions" 
                  placeholder="Select"
                />
                <div class="sub-label">
                  <n-icon :component="TimeOutline" style="vertical-align: middle; margin-right: 4px;" />
                  {{ t('settings.storage.freqDesc') }}
                </div>
              </div>

              <div class="form-item">
                <div class="label">{{ t('settings.storage.maxFiles') }}</div>
                <n-input-number 
                  v-model:value="backupSettings.maxBackups" 
                  :min="1" 
                  :max="50"
                  button-placement="both"
                />
                <div class="sub-label">{{ t('settings.storage.maxFilesDesc') }}</div>
              </div>

              <div class="form-item full-width">
                <div class="label">{{ t('settings.storage.backupPathLabel') }}</div>
                <n-input-group>
                  <n-input 
                    v-model:value="backupSettings.backupPath" 
                    readonly 
                    :placeholder="t('settings.storage.defaultPath')" 
                  />
                  <n-button @click="handleSelectBackupFolder">
                    <template #icon><n-icon :component="FolderOpenOutline" /></template>
                  </n-button>
                </n-input-group>
              </div>
            </div>
          </div>
        </n-collapse-transition>
      </div>
    </div>

    <div class="section" style="margin-top: 40px;">
      <div class="section-title">
        <n-icon :component="ShieldCheckmarkOutline" />
        <span>{{ t('settings.groups.advanced') }}</span>
      </div>

      <div class="maintenance-grid">
        <div class="m-card">
          <div class="m-icon red">
            <n-icon :component="TrashBinOutline" />
          </div>
          <div class="m-content">
            <div class="m-title">{{ t('settings.advanced.cleanAssets') }}</div>
            <div class="m-desc">{{ t('settings.advanced.cleanAssetsDesc') }}</div>
          </div>
          <n-button secondary type="error" @click="handleScan" :loading="isScanning">
            <template #icon><n-icon :component="ScanOutline" /></template>
            {{ t('settings.advanced.scan') }}
          </n-button>
        </div>

        <div class="m-card">
          <div class="m-icon green">
            <n-icon :component="LeafOutline" />
          </div>
          <div class="m-content">
            <div class="m-title">{{ t('settings.advanced.vacuum') }}</div>
            <div class="m-desc">{{ t('settings.advanced.vacuumDesc') }}</div>
          </div>
          <n-button secondary type="success" @click="handleOptimize" :loading="isOptimizing">
            {{ t('settings.advanced.execute') }}
          </n-button>
        </div>
      </div>
    </div>

    <div class="footer-area">
      <div class="section-title" style="justify-content: center; margin-bottom: 20px;">
        <n-icon :component="InformationCircleOutline" /> {{ t('settings.groups.about') }}
      </div>
      
      <div class="dev-card">
        <div class="dev-info">
          <n-avatar 
            round 
            :size="48" 
            :src="APP_CONFIG.avatarUrl" 
            class="dev-avatar"
          />
          <div class="dev-text">
            <div class="dev-name">{{ APP_CONFIG.developerName }}</div>
            <div class="dev-desc">{{ APP_CONFIG.developerDesc }}</div>
          </div>
        </div>
        
        <div class="dev-actions">
          <n-button 
            v-if="APP_CONFIG.links.blog" 
            size="small" tertiary circle 
            @click="openLink(APP_CONFIG.links.blog)"
          >
            <template #icon><n-icon :component="BookOutline" /></template>
          </n-button>

          <n-button 
            v-if="APP_CONFIG.links.github"
            size="small" tertiary circle 
            @click="openLink(APP_CONFIG.links.github)"
          >
            <template #icon><n-icon :component="LogoGithub" /></template>
          </n-button>

          <n-button 
            v-if="APP_CONFIG.sponsor.enable"
            size="small" type="error" secondary round 
            @click="handleSponsor"
          >
            <template #icon><n-icon :component="HeartOutline" /></template>
            Sponsor
          </n-button>
        </div>
      </div>

      <n-divider class="footer-divider" />

      <div class="app-info">
        <div class="app-name">
          <n-icon :component="CodeSlashOutline" />
          <span>{{ APP_CONFIG.appName }}</span>
        </div>
        <div class="version">{{ displayVersion }}</div>
        <div class="copyright">© 2026 {{ APP_CONFIG.developerName }}. All rights reserved.</div>
        <div class="license-declaration">
          Licensed under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" style="color: inherit; text-decoration: underline;">GNU AGPL v3</a>.
          <br>
          This program comes with ABSOLUTELY NO WARRANTY.
        </div>
      </div>
    </div>

    <n-modal v-model:show="showScanModal" preset="dialog" :title="t('settings.scan.title')" style="width: 500px">
      <div v-if="scanResult" class="scan-modal-content">
        <n-card :bordered="false" class="stat-panel">
          <div class="stat-row">
            <n-statistic :label="t('settings.scan.junkFiles')" :value="scanResult.count">
              <template #suffix>{{ t('settings.scan.unit') }}</template>
            </n-statistic>
            <n-statistic :label="t('settings.scan.freedSpace')">
              <template #default>{{ formatSize(scanResult.totalSize) }}</template>
            </n-statistic>
          </div>
        </n-card>
        
        <div v-if="scanResult.count > 0" class="tip-box warning">
          <n-icon :component="InformationCircleOutline" />
          <span>{{ t('settings.scan.warning') }}</span>
        </div>
        <div v-else class="tip-box success">
          <n-icon :component="LeafOutline" />
          <span>{{ t('settings.scan.success') }}</span>
        </div>
      </div>
      
      <template #action>
        <n-space>
          <n-button @click="showScanModal = false">{{ t('common.cancel') }}</n-button>
          <n-button 
            v-if="scanResult && scanResult.count > 0" 
            type="error" 
            @click="executePurge" 
            :loading="isPurging"
          >
            {{ t('settings.scan.cleanNow') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showConfirm" preset="dialog" :title="t('settings.dialogs.migrationTitle')" style="width: 500px">
      <div class="modal-content">
        <p>{{ t('settings.dialogs.migrationDesc') }}</p>
        <div class="path-compare old">{{ currentPath }}</div>
        <div class="arrow">⬇</div>
        <div class="path-compare new">{{ newPath }}</div>
        <p class="warning">{{ t('settings.dialogs.migrationWarning') }}</p>
      </div>
      <template #action>
        <n-space>
          <n-button @click="showConfirm = false">{{ t('common.cancel') }}</n-button>
          <n-button type="warning" @click="executeMigration">{{ t('common.confirm') }}</n-button>
        </n-space>
      </template>
    </n-modal>

  </div>
</template>

<style scoped>
.settings-page {
  padding: 40px 60px;
  height: 100%;
  box-sizing: border-box;
  color: var(--text-primary);
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.header { margin-bottom: 40px; }
.title { font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -1px; }
.subtitle { font-size: 14px; color: var(--text-tertiary); margin-top: 5px; }

.section { margin-bottom: 20px; }
.section-title { 
  display: flex; align-items: center; gap: 10px; 
  font-size: 18px; font-weight: 600; color: var(--text-primary); 
  margin-bottom: 20px; 
}

/* UI 设置面板 */
.ui-panel, .backup-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px;
  padding: 25px;
  transition: all 0.3s;
}
.ui-panel:hover, .backup-panel:hover {
  background: var(--bg-card);
  border-color: var(--border-hover);
}

.lang-trigger {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
}

/* 路径卡片 */
.path-card {
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 30px;
}
.path-header {
  background: var(--bg-sidebar); 
  padding: 8px 15px;
  display: flex; align-items: center; gap: 6px;
  border-bottom: 1px solid var(--border-main);
}
.dot { width: 10px; height: 10px; border-radius: 50%; }
.red { background: #ff5f56; }
.yellow { background: #ffbd2e; }
.green { background: #27c93f; }
.path-label { margin-left: 10px; font-size: 12px; color: var(--text-tertiary); font-family: monospace; }
.path-body {
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  color: #0A84FF;
  word-break: break-all;
  line-height: 1.5;
}
.path-footer {
  padding: 10px 20px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-main);
  font-size: 12px; color: var(--text-tertiary);
  display: flex; align-items: center; gap: 6px;
}

.action-area { display: flex; flex-direction: column; }
.action-label { font-size: 13px; color: var(--text-tertiary); margin-bottom: 8px; }
.input-group { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.migrate-btn-wrapper { 
  max-height: 0; opacity: 0; overflow: hidden; 
  transition: all 0.4s ease;
  margin-top: 15px;
}
.migrate-btn-wrapper.visible { max-height: 60px; opacity: 1; }

.backup-header { display: flex; justify-content: space-between; align-items: center; }
.b-title { font-weight: bold; font-size: 15px; margin-bottom: 5px; color: var(--text-primary); }
.b-desc { font-size: 13px; color: var(--text-tertiary); }
.backup-body { padding-top: 10px; }
.backup-divider { margin: 10px 0 20px 0; opacity: 0.5; background-color: var(--border-main); }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-item { display: flex; flex-direction: column; gap: 8px; }
.form-item.full-width { grid-column: span 2; }
.label { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.sub-label { margin-top: 5px; font-size: 12px; color: var(--text-tertiary); }

.maintenance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.m-card {
  background: var(--bg-card); 
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px; padding: 20px;
  display: flex; flex-direction: column; gap: 15px; align-items: flex-start;
  transition: all 0.2s;
}
.m-card:hover { 
  background: var(--bg-card);
  border-color: var(--border-hover); 
  transform: translateY(-2px); 
}
.m-icon {
  width: 40px; height: 40px; border-radius: 8px; 
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.m-icon.red { background: rgba(255, 69, 58, 0.1); color: #FF453A; }
.m-icon.green { background: rgba(48, 209, 88, 0.1); color: #30D158; }
.m-content { flex: 1; }
.m-title { font-weight: bold; font-size: 15px; color: var(--text-primary); margin-bottom: 5px; }
.m-desc { font-size: 12px; color: var(--text-tertiary); line-height: 1.4; }

.footer-area { margin-top: 60px; padding-top: 20px; }
.dev-card {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  padding: 15px 20px; border-radius: 12px;
}
.dev-info { display: flex; align-items: center; gap: 15px; }
.dev-name { font-weight: bold; font-size: 15px; color: var(--text-primary); }
.dev-desc { font-size: 12px; color: var(--text-tertiary); }
.dev-actions { display: flex; gap: 10px; align-items: center; }
.footer-divider { margin: 20px 0; background-color: var(--border-main); }
.app-info {
  text-align: center; color: var(--text-tertiary); font-size: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.app-name { display: flex; align-items: center; gap: 6px; font-weight: bold; color: var(--text-primary); font-size: 14px; }
.license-declaration {
  margin-top: 8px; font-size: 10px; color: var(--text-tertiary);
  line-height: 1.4; max-width: 300px; opacity: 0.8;
}

/* Modals */
.scan-modal-content { padding: 10px 0; }
.stat-panel { 
  background: var(--bg-sidebar); border: 1px solid var(--border-main);
  border-radius: 8px; margin-bottom: 20px; 
}
.stat-row { display: flex; justify-content: space-around; }
.tip-box { padding: 12px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.tip-box.warning { background: rgba(255, 159, 10, 0.1); color: #FF9F0A; }
.tip-box.success { background: rgba(48, 209, 88, 0.1); color: #30D158; }
.modal-content { padding: 10px 0; }
.path-compare { 
  background: var(--bg-sidebar); color: var(--text-primary);
  padding: 8px; border-radius: 6px; font-size: 12px; word-break: break-all; 
  font-family: monospace; border: 1px solid var(--border-main);
}
.path-compare.old { text-decoration: line-through; opacity: 0.6; color: var(--text-tertiary); }
.path-compare.new { color: #0A84FF; border: 1px solid rgba(10, 132, 255, 0.3); }
.arrow { text-align: center; margin: 5px 0; opacity: 0.5; color: var(--text-tertiary); }
.warning { color: #f2c97d; font-size: 12px; margin-top: 15px; }
</style>