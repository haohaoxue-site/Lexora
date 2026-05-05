import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { shallowRef } from 'vue'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function useFormSubmit<T = void>(options: {
  action: () => Promise<T>
  validate?: () => boolean
  fallbackError?: string
  onSuccess?: (result: T) => void | Promise<void>
}) {
  const isSubmitting = shallowRef(false)

  async function submit(formRef: FormInstance | null | undefined) {
    if (formRef) {
      const valid = await formRef.validate().catch(() => false)
      if (valid === false)
        return
    }
    if (options.validate && !options.validate())
      return

    isSubmitting.value = true
    try {
      const result = await options.action()
      await options.onSuccess?.(result)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, options.fallbackError ?? '操作失败'))
    }
    finally {
      isSubmitting.value = false
    }
  }

  return { isSubmitting, submit }
}
