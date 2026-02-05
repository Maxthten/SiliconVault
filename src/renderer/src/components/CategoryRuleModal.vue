<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NCard, NInput, NForm, NFormItem, NButton, NDivider, useMessage } from 'naive-ui'

const props = defineProps<{
  show: boolean
  category: string
}>()

const emit = defineEmits(['update:show', 'refresh'])
const message = useMessage()

// 表单数据 (对应数据库的 CategoryRule 结构)
const form = ref({
  nameLabel: '', 
  namePlaceholder: '',
  valueLabel: '', 
  valuePlaceholder: '',
  packageLabel: ''
})

// 打开时加载当前规则
watch(() => props.show, async (val) => {
  if (val && props.category) {
    try {
      // 调用 API 获取当前规则 (可能是自定义的，也可能是系统预设的)
      const rule = await window.api.getCategoryRule(props.category)
      form.value = { ...rule }
    } catch (e) {
      console.error(e)
      message.error('加载配置失败')
    }
  }
})

// 保存自定义
const handleSave = async () => {
  try {
    await window.api.saveCategoryRule(props.category, form.value)
    message.success(`已更新 [${props.category}] 的字段定义`)
    emit('update:show', false)
    emit('refresh') // 通知父组件刷新界面
  } catch (e) {
    message.error('保存失败')
  }
}

// 重置为默认
const handleReset = async () => {
  try {
    await window.api.resetCategoryRule(props.category)
    message.success(`[${props.category}] 已恢复默认设置`)
    emit('update:show', false)
    emit('refresh')
  } catch (e) {
    message.error('重置失败')
  }
}
</script>

<template>
  <n-modal :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card 
      :title="`⚙️ 配置分类: ${category}`" 
      class="rule-modal" 
      :bordered="false" 
      role="dialog" 
      aria-modal="true"
    >
      <div class="intro">
        自定义该分类下各个输入框的显示名称。
        <br>例如：把 "Value" 改为 "阻值"，把 "Name" 改为 "精度"。
      </div>

      <n-form size="small" label-placement="left" label-width="80">
        
        <n-divider title-placement="left">核心字段 (Value)</n-divider>
        <n-form-item label="显示名称">
          <n-input v-model:value="form.valueLabel" placeholder="例如：阻值" />
        </n-form-item>
        <n-form-item label="提示语">
          <n-input v-model:value="form.valuePlaceholder" placeholder="例如：必填 (如 10k)" />
        </n-form-item>

        <n-divider title-placement="left">辅助字段 (Name/Model)</n-divider>
        <n-form-item label="显示名称">
          <n-input v-model:value="form.nameLabel" placeholder="例如：精度/功率" />
        </n-form-item>
        <n-form-item label="提示语">
          <n-input v-model:value="form.namePlaceholder" placeholder="例如：选填" />
        </n-form-item>
        
        <n-divider title-placement="left">封装字段</n-divider>
        <n-form-item label="显示名称">
          <n-input v-model:value="form.packageLabel" placeholder="例如：封装" />
        </n-form-item>

      </n-form>

      <template #footer>
        <div class="footer">
          <n-button type="warning" ghost @click="handleReset">↺ 恢复默认</n-button>
          
          <div class="right-btns">
            <n-button @click="emit('update:show', false)">取消</n-button>
            <n-button type="primary" @click="handleSave">保存配置</n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.rule-modal { 
  width: 480px; 
  background-color: #1c1c1e; 
  border-radius: 12px; 
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

:deep(.n-card-header__main) {
  color: #fff;
}

:deep(.n-divider__title) {
  color: #888;
  font-size: 12px;
}

.intro { 
  color: #888; 
  margin-bottom: 20px; 
  font-size: 13px; 
  line-height: 1.5;
  background: rgba(255,255,255,0.05);
  padding: 10px;
  border-radius: 8px;
}

.footer { 
  display: flex; 
  justify-content: space-between; 
  margin-top: 10px; 
}

.right-btns { 
  display: flex; 
  gap: 10px; 
}
</style>