import type {
  HomeOverviewModel,
  HomeRecentDocument,
  HomeScheduleItem,
} from '../typing'
import { DOCUMENT_COLLECTION } from '@haohaoxue/samepage-contracts'
import { computed, onMounted, ref } from 'vue'
import { getRecentDocuments } from '@/apis/document'
import { useUserStore } from '@/stores/user'
import { formatMonthDayWeekday } from '@/utils/dayjs'

const schedules: HomeScheduleItem[] = [
  {
    id: 'schedule-standup',
    timeLabel: '10:00',
    title: '团队例会',
    description: '',
  },
  {
    id: 'schedule-review',
    timeLabel: '14:30',
    title: '文档整理',
    description: '',
  },
  {
    id: 'schedule-polish',
    timeLabel: '18:00',
    title: '收尾检查',
    description: '',
  },
]

export function useHome() {
  const userStore = useUserStore()
  const recentDocumentSource = ref<HomeRecentDocument[]>([])
  const currentUser = computed(() => userStore.currentUser!)
  const recentDocuments = computed(() =>
    recentDocumentSource.value.filter(document => document.collection !== DOCUMENT_COLLECTION.TEAM),
  )

  const overview = computed<HomeOverviewModel>(() => ({
    eyebrow: 'SamePage Workspace',
    title: `你好，${currentUser.value.displayName}`,
    description: '从最近文档继续推进，或者先看一眼今天的节奏安排。',
    dateLabel: formatMonthDayWeekday(),
  }))

  async function loadRecentDocuments() {
    recentDocumentSource.value = await getRecentDocuments()
  }

  onMounted(loadRecentDocuments)

  return {
    overview,
    schedules,
    recentDocuments,
  }
}
