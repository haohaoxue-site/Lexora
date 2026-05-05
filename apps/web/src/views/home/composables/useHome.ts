import type {
  HomeOverviewModel,
  HomeRecentDocument,
  HomeScheduleItem,
  HomeWidgetDefinition,
  HomeWidgetId,
} from '../typing'
import { DOCUMENT_COLLECTION } from '@haohaoxue/samepage-contracts'
import { computed, onMounted, ref } from 'vue'
import { getRecentDocuments } from '@/apis/document'
import { useUiStore } from '@/stores/ui'
import { useUserStore } from '@/stores/user'
import { formatMonthDayWeekday } from '@/utils/dayjs'

const widgetDefinitions: HomeWidgetDefinition[] = [
  {
    id: 'welcome',
    title: '欢迎语',
    description: '工作区摘要与当日状态。',
  },
  {
    id: 'recent-documents',
    title: '最近文档',
    description: '继续上次编辑上下文。',
  },
  {
    id: 'schedule',
    title: '日程',
    description: '本日固定节奏与节点检查。',
  },
]

const defaultWidgetIds: HomeWidgetId[] = widgetDefinitions.map(widget => widget.id)
const validWidgetIdSet = new Set<HomeWidgetId>(defaultWidgetIds)

function isHomeWidgetId(widgetId: string): widgetId is HomeWidgetId {
  return validWidgetIdSet.has(widgetId as HomeWidgetId)
}

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
  const uiStore = useUiStore()
  const userStore = useUserStore()
  const recentDocumentSource = ref<HomeRecentDocument[]>([])
  const currentUser = computed(() => userStore.currentUser!)
  const recentDocuments = computed(() =>
    recentDocumentSource.value.filter(document => document.collection !== DOCUMENT_COLLECTION.TEAM),
  )
  const visibleWidgetIds = computed(() => {
    const storedWidgetIds = uiStore.homeVisibleWidgetIds

    if (storedWidgetIds == null) {
      return [...defaultWidgetIds]
    }

    return storedWidgetIds.filter(isHomeWidgetId)
  })

  const overview = computed<HomeOverviewModel>(() => ({
    eyebrow: 'SamePage Workspace',
    title: `你好，${currentUser.value.displayName}`,
    description: '从最近文档继续推进，或者先看一眼今天的节奏安排。',
    dateLabel: formatMonthDayWeekday(),
  }))

  const visibleWidgetSet = computed(() => new Set(
    visibleWidgetIds.value.filter((widgetId): widgetId is HomeWidgetId => validWidgetIdSet.has(widgetId)),
  ))
  const visibleWidgets = computed(() => widgetDefinitions.filter(widget => visibleWidgetSet.value.has(widget.id)))

  async function loadRecentDocuments() {
    recentDocumentSource.value = await getRecentDocuments()
  }

  function toggleWidget(widgetId: HomeWidgetId) {
    const nextWidgetIds = new Set(visibleWidgetSet.value)

    if (nextWidgetIds.has(widgetId)) {
      nextWidgetIds.delete(widgetId)
    }
    else {
      nextWidgetIds.add(widgetId)
    }

    const nextVisibleWidgetIds = widgetDefinitions
      .map(widget => widget.id)
      .filter(widgetIdItem => nextWidgetIds.has(widgetIdItem))

    uiStore.setHomeVisibleWidgetIds(nextVisibleWidgetIds)
  }

  onMounted(loadRecentDocuments)

  return {
    overview,
    schedules,
    recentDocuments,
    widgetDefinitions,
    visibleWidgets,
    visibleWidgetSet,
    toggleWidget,
  }
}
