import type { SystemEmailProvider } from '@haohaoxue/samepage-contracts'
import { SYSTEM_EMAIL_PROVIDER_LABELS } from '@haohaoxue/samepage-contracts'

export function formatSystemEmailProvider(value: SystemEmailProvider): string {
  return SYSTEM_EMAIL_PROVIDER_LABELS[value]
}
