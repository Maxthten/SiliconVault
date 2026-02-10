import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.json'
import enUS from '../locales/en-US.json'

// 配置 i18n
// legacy: false 表示我们使用 Vue 3 的组合式 API (Composition API)
// locale: 'zh-CN' 设置默认语言为中文
export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN', 
  fallbackLocale: 'zh-CN', // 如果找不到翻译，回退到中文
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

// 导出一些快捷方法
export const t = i18n.global.t
export const useI18n = () => {
  // @ts-ignore: i18n 类型推断在某些 setup 环境下可能需要忽略检查
  const { t, locale } = i18n.global
  return { t, locale }
}