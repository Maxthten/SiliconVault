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
  NButton, NIcon, NInput, NInputGroup, useMessage, NModal, NSpace, NAvatar, NDivider, NCard, NStatistic,
  NSwitch, NSelect, NInputNumber, NCollapseTransition
} from 'naive-ui'
import { 
  FolderOpenOutline, ArrowForwardCircleOutline, 
  SaveOutline, InformationCircleOutline,
  LogoGithub, HeartOutline, CodeSlashOutline, BookOutline,
  ConstructOutline, TrashBinOutline, LeafOutline, ScanOutline,
  CloudUploadOutline, TimeOutline, ColorPaletteOutline, FlashOutline
} from '@vicons/ionicons5'

import localAvatar from '@renderer/assets/icon.png'
import { ANIMATION_OPTIONS, DEFAULT_ANIMATION } from '@renderer/config/animations'

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
    url: 'https://afdian.net/a/your-id', 
  }
}

const message = useMessage()

// 状态
const currentPath = ref('')
const newPath = ref('')
const displayVersion = ref('Loading...')
const isMigrating = ref(false)
const showConfirm = ref(false)
const isInitialized = ref(false) 

// --- 界面设置 ---
const uiSettings = ref({
  transitionName: DEFAULT_ANIMATION
})

const transitionOptions = ANIMATION_OPTIONS

// 备份设置
const backupSettings = ref({
  autoBackup: false,
  backupFrequency: 'exit',
  backupPath: '',
  maxBackups: 5
})

const frequencyOptions = [
  { label: '仅在应用退出时', value: 'exit' },
  { label: '每 30 分钟', value: '30min' },
  { label: '每 1 小时', value: '1h' },
  { label: '每 4 小时', value: '4h' }
]

// 维护状态
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

// 初始化
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
    message.error('初始化信息失败')
  } finally {
    setTimeout(() => {
      isInitialized.value = true
    }, 100)
  }
}

onUnmounted(() => {
  message.destroyAll()
})

watch(() => uiSettings.value.transitionName, (newVal) => {
  if (!isInitialized.value) return 

  localStorage.setItem('ui-transition', newVal)
  window.dispatchEvent(new Event('ui-transition-changed'))
  
  message.success('切换动画已应用', { duration: 1500 })
})

watch(backupSettings, async (newVal) => {
  if (!isInitialized.value) return 

  try {
    await window.api.saveAppSettings(JSON.parse(JSON.stringify(newVal)))
  } catch (e) {
    console.error('保存设置失败', e)
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
  if (APP_CONFIG.sponsor.mode === 'url') {
    openLink(APP_CONFIG.sponsor.url)
  } else {
    await window.api.openDataFolder()
    message.info('已打开数据文件夹')
  }
}

const handleSelectFolder = async () => {
  const path = await window.api.selectFolder()
  if (path) {
    newPath.value = path
  }
}

const preCheckMigration = () => {
  if (newPath.value === currentPath.value) {
    message.warning('路径未发生变化')
    return
  }
  showConfirm.value = true
}

const executeMigration = async () => {
  showConfirm.value = false
  isMigrating.value = true
  const hideLoading = message.loading('正在搬运数据...', { duration: 0 })
  
  try {
    await window.api.updateStoragePath(newPath.value)
    hideLoading.destroy()
    message.success('迁移成功，即将重启...')
  } catch (e) {
    hideLoading.destroy()
    message.error('迁移失败，请检查权限')
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
    message.error(`扫描失败: ${e.message || '未知错误'}`)
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
    message.success(`清理完成：释放 ${formatSize(res.freedSpace)}`)
    showScanModal.value = false
    scanResult.value = null 
  } catch (e) {
    message.error('清理过程中发生错误')
  } finally {
    isPurging.value = false
  }
}

const handleOptimize = async () => {
  isOptimizing.value = true
  try {
    const res = await window.api.optimizeDatabase()
    message.success(`优化完成：清理了 ${res.orphansRemoved} 条孤立数据`)
  } catch (e:any) {
    message.error(`数据库优化失败: ${e.message}`)
  } finally {
    isOptimizing.value = false
  }
}

onMounted(init)
</script>

<template>
  <div class="settings-page">
    
    <div class="header">
      <h1 class="title">系统设置</h1>
      <p class="subtitle">偏好设置与数据管理</p>
    </div>

    <div class="section">
      <div class="section-title">
        <n-icon :component="ColorPaletteOutline" />
        <span>外观与风格</span>
      </div>
      
      <div class="ui-panel">
        <div class="form-grid">
          <div class="form-item full-width">
            <div class="label">页面转场动画</div>
            <n-select 
              v-model:value="uiSettings.transitionName" 
              :options="transitionOptions" 
              placeholder="选择切换动画"
            />
            <div class="sub-label">
              <n-icon :component="FlashOutline" style="vertical-align: middle; margin-right: 4px;" />
              决定页面切换时的视觉流畅度与速度
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section" style="margin-top: 40px;">
      <div class="section-title">
        <n-icon :component="SaveOutline" />
        <span>数据存储库</span>
      </div>
      
      <div class="path-card">
        <div class="path-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="path-label">Current Location</span>
        </div>
        <div class="path-body">
          {{ currentPath }}
        </div>
        <div class="path-footer">
          <n-icon :component="InformationCircleOutline" />
          <span>包含所有元件数据库、高清图片及技术手册 (PDF)</span>
        </div>
      </div>

      <div class="action-area">
        <div class="action-label">数据迁移 / Change Location</div>
        <n-input-group class="input-group">
          <n-input 
            v-model:value="newPath" 
            readonly 
            placeholder="选择新的存储目录..." 
            class="path-input"
            size="large"
          />
          <n-button type="primary" secondary size="large" @click="handleSelectFolder">
            <template #icon><n-icon :component="FolderOpenOutline" /></template>
            浏览
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
            开始迁移并重启软件
          </n-button>
        </div>
      </div>
    </div>

    <div class="section" style="margin-top: 40px;">
      <div class="section-title">
        <n-icon :component="CloudUploadOutline" />
        <span>自动备份策略</span>
      </div>

      <div class="backup-panel">
        <div class="backup-header">
          <div class="backup-info">
            <div class="b-title">启用自动备份</div>
            <div class="b-desc">根据预设频率自动打包全量数据，防止意外丢失。</div>
          </div>
          <n-switch v-model:value="backupSettings.autoBackup" size="large">
            <template #checked>开启</template>
            <template #unchecked>关闭</template>
          </n-switch>
        </div>

        <n-collapse-transition :show="backupSettings.autoBackup">
          <div class="backup-body">
            <n-divider class="backup-divider" />
            
            <div class="form-grid">
              <div class="form-item">
                <div class="label">备份频率</div>
                <n-select 
                  v-model:value="backupSettings.backupFrequency" 
                  :options="frequencyOptions" 
                  placeholder="选择频率"
                />
                <div class="sub-label">
                  <n-icon :component="TimeOutline" style="vertical-align: middle; margin-right: 4px;" />
                  仅在数据发生变更时触发
                </div>
              </div>

              <div class="form-item">
                <div class="label">保留份数</div>
                <n-input-number 
                  v-model:value="backupSettings.maxBackups" 
                  :min="1" 
                  :max="50"
                  button-placement="both"
                />
                <div class="sub-label">
                  滚动删除旧备份，节省空间
                </div>
              </div>

              <div class="form-item full-width">
                <div class="label">备份存储位置</div>
                <n-input-group>
                  <n-input 
                    v-model:value="backupSettings.backupPath" 
                    readonly 
                    placeholder="选择备份存放目录..." 
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
        <n-icon :component="ConstructOutline" />
        <span>数据维护</span>
      </div>

      <div class="maintenance-grid">
        <div class="m-card">
          <div class="m-icon red">
            <n-icon :component="TrashBinOutline" />
          </div>
          <div class="m-content">
            <div class="m-title">冗余文件清理</div>
            <div class="m-desc">扫描 assets 目录下未被引用的图片和文档，释放存储空间。</div>
          </div>
          <n-button secondary type="error" @click="handleScan" :loading="isScanning">
            <template #icon><n-icon :component="ScanOutline" /></template>
            扫描
          </n-button>
        </div>

        <div class="m-card">
          <div class="m-icon green">
            <n-icon :component="LeafOutline" />
          </div>
          <div class="m-content">
            <div class="m-title">数据库深度优化</div>
            <div class="m-desc">清理孤立的 BOM 关联数据，并执行 VACUUM 重组数据库文件。</div>
          </div>
          <n-button secondary type="success" @click="handleOptimize" :loading="isOptimizing">
            立即优化
          </n-button>
        </div>
      </div>
    </div>

    <div class="footer-area">
      
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

    <n-modal v-model:show="showScanModal" preset="dialog" title="扫描结果" style="width: 500px">
      <div v-if="scanResult" class="scan-modal-content">
        <n-card :bordered="false" class="stat-panel">
          <div class="stat-row">
            <n-statistic label="发现垃圾文件" :value="scanResult.count">
              <template #suffix>个</template>
            </n-statistic>
            <n-statistic label="可释放空间">
              <template #default>
                 {{ formatSize(scanResult.totalSize) }}
              </template>
            </n-statistic>
          </div>
        </n-card>
        
        <div v-if="scanResult.count > 0" class="tip-box warning">
          <n-icon :component="InformationCircleOutline" />
          <span>这些文件未被数据库中的任何元器件或项目引用。删除操作不可逆，请确认。</span>
        </div>
        <div v-else class="tip-box success">
          <n-icon :component="LeafOutline" />
          <span>太棒了！您的数据存储非常干净，没有发现冗余文件。</span>
        </div>
      </div>
      
      <template #action>
        <n-space>
          <n-button @click="showScanModal = false">关闭</n-button>
          <n-button 
            v-if="scanResult && scanResult.count > 0" 
            type="error" 
            @click="executePurge" 
            :loading="isPurging"
          >
            立即清理
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showConfirm" preset="dialog" title="⚠️ 数据迁移确认" style="width: 500px">
      <div class="modal-content">
        <p>您即将把所有数据从：</p>
        <div class="path-compare old">{{ currentPath }}</div>
        <div class="arrow">⬇</div>
        <div class="path-compare new">{{ newPath }}</div>
        <p class="warning">注意：迁移完成后应用将自动重启。</p>
      </div>
      <template #action>
        <n-space>
          <n-button @click="showConfirm = false">我再想想</n-button>
          <n-button type="warning" @click="executeMigration">确认迁移</n-button>
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
.ui-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px;
  padding: 25px;
  transition: all 0.3s;
}
.ui-panel:hover {
  background: var(--bg-card);
  border-color: var(--border-hover);
}

/* 路径卡片 - 终端风格容器 */
.path-card {
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 30px;
}
.path-header {
  background: var(--bg-sidebar); /* 侧栏色作为标题栏 */
  padding: 8px 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border-main);
}
.dot { width: 10px; height: 10px; border-radius: 50%; }
.red { background: #ff5f56; }
.yellow { background: #ffbd2e; }
.green { background: #27c93f; }
.path-label { margin-left: 10px; font-size: 12px; color: var(--text-tertiary); font-family: monospace; }
.path-body {
  padding: 20px;
  font-family: 'JetBrains Mono', 'Menlo', monospace;
  font-size: 15px;
  color: #0A84FF; /* 保持 accent color */
  word-break: break-all;
  line-height: 1.5;
}
.path-footer {
  padding: 10px 20px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-main);
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-label { font-size: 13px; color: var(--text-tertiary); margin-bottom: 8px; }
.input-group { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.migrate-btn-wrapper { 
  max-height: 0; opacity: 0; overflow: hidden; 
  transition: all 0.4s ease;
  margin-top: 15px;
}
.migrate-btn-wrapper.visible { max-height: 60px; opacity: 1; }

/* 备份面板样式 */
.backup-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  border-radius: 12px;
  padding: 25px;
  transition: all 0.3s;
}
.backup-panel:hover {
  background: var(--bg-card);
  border-color: var(--border-hover);
}
.backup-header {
  display: flex; justify-content: space-between; align-items: center;
}
.b-title { font-weight: bold; font-size: 15px; margin-bottom: 5px; color: var(--text-primary); }
.b-desc { font-size: 13px; color: var(--text-tertiary); }
.backup-body { padding-top: 10px; }
.backup-divider { margin: 10px 0 20px 0; opacity: 0.5; background-color: var(--border-main); }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.form-item { display: flex; flex-direction: column; gap: 8px; }
.form-item.full-width { grid-column: span 2; }
.label { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.sub-label { margin-top: 5px; font-size: 12px; color: var(--text-tertiary); }

/* 维护卡片网格 */
.maintenance-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
}
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

/* 扫描弹窗 */
.scan-modal-content { padding: 10px 0; }
.stat-panel { 
  background: var(--bg-sidebar); 
  border: 1px solid var(--border-main);
  border-radius: 8px; margin-bottom: 20px; 
}
.stat-row { display: flex; justify-content: space-around; }
.tip-box {
  padding: 12px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px;
}
.tip-box.warning { background: rgba(255, 159, 10, 0.1); color: #FF9F0A; }
.tip-box.success { background: rgba(48, 209, 88, 0.1); color: #30D158; }

/* 底部区域 */
.footer-area { margin-top: 60px; padding-top: 20px; }

/* 开发者卡片 */
.dev-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-main);
  box-shadow: var(--shadow-card);
  padding: 15px 20px;
  border-radius: 12px;
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
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-tertiary);
  line-height: 1.4;
  max-width: 300px;
  opacity: 0.8;
}

/* 通用弹窗内容 */
.modal-content { padding: 10px 0; }
.path-compare { 
  background: var(--bg-sidebar); 
  color: var(--text-primary);
  padding: 8px; border-radius: 6px; font-size: 12px; word-break: break-all; 
  font-family: monospace; border: 1px solid var(--border-main);
}
.path-compare.old { text-decoration: line-through; opacity: 0.6; color: var(--text-tertiary); }
.path-compare.new { color: #0A84FF; border: 1px solid rgba(10, 132, 255, 0.3); }
.arrow { text-align: center; margin: 5px 0; opacity: 0.5; color: var(--text-tertiary); }
.warning { color: #f2c97d; font-size: 12px; margin-top: 15px; }
</style>