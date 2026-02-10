import { useMessage } from 'naive-ui'
import { useI18n } from './i18n' 

export const useI18nMessage = () => {
  const message = useMessage()
  const { t } = useI18n()

  
  return {
    success: (key: string) => {
      message.success(t(`messages.success.${key}`))
    },
    error: (key: string) => {
      message.error(t(`messages.error.${key}`))
    },
    warning: (key: string) => {
      message.warning(t(`messages.warning.${key}`))
    },
    info: (key: string) => {
      message.info(t(`messages.info.${key}`))
    },
    raw: message
  }
}