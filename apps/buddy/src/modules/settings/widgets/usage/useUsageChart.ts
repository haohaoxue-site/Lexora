import type { EChartsType } from 'echarts/core'
import type { ComputedRef, Ref } from 'vue'
import type { UsageChartOption } from '../../model/usageCharts'
import { useElementSize } from '@vueuse/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import { useThemeVars } from 'naive-ui'
import { onScopeDispose, watch } from 'vue'

use([LineChart, PieChart, GridComponent, TooltipComponent, LabelLayout, CanvasRenderer])

export function useUsageChart(element: Readonly<Ref<HTMLDivElement | null>>, option: ComputedRef<UsageChartOption>) {
  const { width, height } = useElementSize(element)
  const theme = useThemeVars()
  let chart: EChartsType | null = null
  let renderedOption: UsageChartOption | null = null
  let renderedTheme = theme.value

  function hideTip() {
    chart?.dispatchAction({ type: 'hideTip' })
    chart?.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
    chart?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
  }

  watch([width, height, option, theme], ([width, height, option, theme]) => {
    if (!element.value || width <= 0 || height <= 0)
      return
    chart ??= init(element.value, null, { renderer: 'canvas', width, height })
    hideTip()
    if (chart.getWidth() !== width || chart.getHeight() !== height)
      chart.resize({ width, height, silent: true })
    if (option === renderedOption && theme === renderedTheme)
      return
    chart.setOption({
      animation: false,
      textStyle: { fontFamily: getComputedStyle(element.value).fontFamily },
      ...option,
      tooltip: {
        renderMode: 'richText',
        confine: true,
        enterable: false,
        showDelay: 0,
        hideDelay: 0,
        transitionDuration: 0,
        backgroundColor: theme.popoverColor,
        borderColor: theme.borderColor,
        borderWidth: 1,
        padding: [9, 12],
        textStyle: { color: theme.textColor2, fontSize: 12, lineHeight: 19 },
        ...option.tooltip,
      },
    } satisfies UsageChartOption, { notMerge: true })
    renderedOption = option
    renderedTheme = theme
  }, { flush: 'post' })

  onScopeDispose(() => chart?.dispose())

  return {
    hideTip,
    showTip(index: number) {
      if (!chart || index < 0)
        return
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: index })
      if (option.value.xAxis) {
        const x = chart.convertToPixel({ xAxisIndex: 0 }, index)
        chart.dispatchAction({ type: 'showTip', x, y: chart.getHeight() / 2 })
      }
      else {
        chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: index })
      }
    },
  }
}
