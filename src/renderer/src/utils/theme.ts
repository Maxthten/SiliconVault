import { GlobalThemeOverrides } from 'naive-ui'

export const getThemeOverrides = (isDark: boolean): GlobalThemeOverrides => {
  if (isDark) {
    // 暗色模式配置 (保持原样)
    return {
      common: {
        primaryColor: '#0A84FF',
        primaryColorHover: '#409CFF',
        borderRadius: '10px',
        fontFamily: '"SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif',
        bodyColor: 'transparent',
        cardColor: 'rgba(28, 28, 30, 0.6)'
      },
      Card: {
        color: 'rgba(28, 28, 30, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        textColor: 'rgba(255, 255, 245, 0.86)'
      },
      Message: {
        color: 'rgba(28, 28, 30, 0.95)',
        textColor: '#fff',
        borderRadius: '12px',
        padding: '12px 20px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
      }
    }
  } else {
    // 亮色模式配置 (高对比度增强版)
    return {
      common: {
        primaryColor: '#007AFF',
        primaryColorHover: '#0056B3',
        borderRadius: '10px',
        fontFamily: '"SF Pro Text", "Helvetica Neue", "Microsoft YaHei", sans-serif',
        bodyColor: 'transparent',
        // 这里的 cardColor 只是 fallback，实际上被 base.css 接管了
        cardColor: '#ffffff'
      },
      Card: {
        color: '#ffffff',
        // 强制加深边框，防止糊成一片
        borderColor: 'rgba(0, 0, 0, 0.12)', 
        textColor: '#111111',
        // 强制加深阴影，制造“悬浮感”
        boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)'
      },
      Message: {
        color: '#ffffff',
        textColor: '#111111',
        borderRadius: '12px',
        padding: '12px 20px',
        // 消息提示要比卡片更高，所以阴影更重
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)'
      }
    }
  }
}