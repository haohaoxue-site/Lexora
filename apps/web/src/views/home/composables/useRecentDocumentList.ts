import { formatDocumentLocation } from '@haohaoxue/samepage-shared'
import { formatMonthDayTime } from '@/utils/dayjs'

export function useRecentDocumentList() {
  function formatDocumentUpdatedAt(value: string) {
    return formatMonthDayTime(value)
  }

  return {
    formatDocumentLocation,
    formatDocumentUpdatedAt,
  }
}
