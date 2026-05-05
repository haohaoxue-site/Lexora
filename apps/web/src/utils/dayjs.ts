import type { ConfigType } from 'dayjs'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export function formatMonthDayWeekday(value: ConfigType = dayjs()) {
  return dayjs(value).format('M月D日dddd')
}

export function formatMonthDayTime(value: ConfigType) {
  return dayjs(value).format('M/D HH:mm')
}

export function formatDateTime(value: ConfigType) {
  return dayjs(value).format('YYYY/M/D HH:mm:ss')
}

export default dayjs
