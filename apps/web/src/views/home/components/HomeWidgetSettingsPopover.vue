<script setup lang="ts">
import type {
  HomeWidgetSettingsPopoverEmits,
  HomeWidgetSettingsPopoverProps,
} from '../typing'

defineProps<HomeWidgetSettingsPopoverProps>()

const emits = defineEmits<HomeWidgetSettingsPopoverEmits>()
</script>

<template>
  <ElPopover
    trigger="click"
    placement="bottom-end"
    :width="336"
    :offset="12"
  >
    <template #reference>
      <ElButton
        circle
        class="home-widget-settings home-widget-settings__trigger"
      >
        <SvgIcon category="ui" icon="widget-settings" size="1.125rem" class="home-widget-settings__trigger-icon" />
      </ElButton>
    </template>

    <div class="home-widget-settings space-y-4">
      <div>
        <div class="text-sm font-semibold text-main">
          模块显示
        </div>
        <div class="home-widget-settings__description">
          选择主页需要保留的内容模块。
        </div>
      </div>

      <ul class="home-widget-settings__list">
        <li
          v-for="widget in widgets"
          :key="widget.id"
          class="home-widget-settings__item"
        >
          <div class="min-w-0 flex-1">
            <div class="home-widget-settings__item-title">
              {{ widget.title }}
            </div>
            <div class="home-widget-settings__description">
              {{ widget.description }}
            </div>
          </div>

          <ElSwitch
            :model-value="visibleWidgetSet.has(widget.id)"
            @change="emits('toggle', widget.id)"
          />
        </li>
      </ul>
    </div>
  </ElPopover>
</template>

<style scoped lang="scss">
.home-widget-settings {
  &.home-widget-settings__trigger {
    border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    color: var(--brand-text-secondary);
    background: var(--brand-bg-surface-raised);
    width: 2.5rem;
    height: 2.5rem;

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      color: var(--brand-primary);
      background: var(--brand-bg-surface);
    }
  }

  .home-widget-settings__trigger-icon {
    display: block;
  }

  .home-widget-settings__description {
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.25rem;
  }

  .home-widget-settings__list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .home-widget-settings__item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 1rem;
    background: var(--brand-bg-surface);
  }

  .home-widget-settings__item-title {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
  }
}
</style>
