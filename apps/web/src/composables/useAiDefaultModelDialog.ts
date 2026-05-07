import type { Router } from 'vue-router'
import { ElMessageBox } from 'element-plus'

interface ShowAiDefaultModelMissingDialogOptions {
  router: Router
  title: string
  message: string
}

let defaultModelDialogPromise: Promise<unknown> | null = null

export function showAiDefaultModelMissingDialog(
  options: ShowAiDefaultModelMissingDialogOptions,
): void {
  if (defaultModelDialogPromise) {
    return
  }

  defaultModelDialogPromise = ElMessageBox.confirm(options.message, options.title, {
    type: 'warning',
    autofocus: false,
    closeOnClickModal: false,
    closeOnPressEscape: true,
    confirmButtonText: '前往配置',
    cancelButtonText: '稍后再说',
  })
    .then(() => {
      void options.router.push('/provider/usage')
    })
    .catch(() => undefined)
    .finally(() => {
      defaultModelDialogPromise = null
    })
}
