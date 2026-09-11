import type { LocalUsageTrend } from '@buddy-shared/usage/usageAnalyticsApi'
import type { LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'

export type UsageChartOption = Omit<ComposeOption<LineSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption>, 'tooltip'> & { tooltip?: TooltipComponentOption }

export function createUsageTrendChart(buckets: LocalUsageTrend) {
  return {
    xAxis: { type: 'category', boundaryGap: false, data: buckets.map(bucket => bucket.startAt) },
    yAxis: { type: 'value', min: 0, minInterval: 1, max: buckets.some(bucket => (bucket.totalTokens ?? 0) > 0) ? undefined : 1 },
    series: [{
      id: 'usage-trend',
      type: 'line',
      data: buckets.map(bucket => bucket.totalTokens),
      smooth: 0.3,
      smoothMonotone: 'x',
      connectNulls: false,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.08 },
      emphasis: { scale: 1.5 },
    }],
  } satisfies UsageChartOption
}

export function createUsagePieChart(rows: readonly { key: string, name: string, label: string, totalTokens: number }[]) {
  const data = rows.filter(row => row.totalTokens > 0).map(row => ({ id: row.key, name: row.name, value: row.totalTokens, label: { formatter: () => row.label } }))
  return {
    series: [{
      id: 'usage-models',
      type: 'pie',
      radius: [0, '45%'],
      padAngle: data.length > 1 ? 3 : 0,
      stillShowZeroSum: false,
      showEmptyCircle: true,
      avoidLabelOverlap: true,
      label: { position: 'outside', alignTo: 'edge', edgeDistance: 4, distanceToLabelLine: 5, fontSize: 11, lineHeight: 17, overflow: 'truncate' },
      labelLine: { length: 12, length2: 10, smooth: 0.15 },
      labelLayout: { hideOverlap: true },
      itemStyle: { borderRadius: 3 },
      emphasis: { scale: false, itemStyle: { opacity: 0.8 } },
      data,
    }],
  } satisfies UsageChartOption
}
