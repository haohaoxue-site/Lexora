<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ArrowCollapseAll20Regular, ArrowExpand20Regular, ArrowWrap20Regular, PanelRight20Regular, TextColumnOne20Regular, TextColumnTwo20Regular } from '@vicons/fluent'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopContextAction from './DesktopContextAction.vue'

const props = defineProps<{ language: BuddyLocale, added: number, deleted: number, canShowTurn: boolean, allCollapsed: boolean, wrap: boolean, sideBySide: boolean, treeVisible: boolean }>()
defineEmits<{ toggleAll: [], toggleWrap: [], toggleLayout: [], toggleTree: [] }>()
const range = defineModel<'all' | 'turn'>('range', { required: true })
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <div class="desktop-change-toolbar">
    <div class="desktop-change-toolbar__range">
      <button type="button" :class="{ 'is-active': range === 'all' }" @click="range = 'all'">
        {{ t('desktop.context.allChanges') }}
      </button>
      <button type="button" :disabled="!canShowTurn" :class="{ 'is-active': range === 'turn' }" @click="range = 'turn'">
        {{ t('desktop.context.turnChanges') }}
      </button>
    </div>
    <div class="desktop-change-toolbar__counts" data-testid="change-line-counts">
      <span class="is-added">+{{ added }}</span><span class="is-deleted">-{{ deleted }}</span>
    </div>
    <div class="desktop-change-toolbar__actions">
      <DesktopContextAction :icon="allCollapsed ? ArrowExpand20Regular : ArrowCollapseAll20Regular" :label="t(allCollapsed ? 'desktop.context.expandAll' : 'desktop.context.collapseAll')" @click="$emit('toggleAll')" />
      <DesktopContextAction :icon="ArrowWrap20Regular" :label="t('desktop.context.wrap')" :active="wrap" @click="$emit('toggleWrap')" />
      <DesktopContextAction :icon="sideBySide ? TextColumnTwo20Regular : TextColumnOne20Regular" :label="t(sideBySide ? 'desktop.context.inlineDiff' : 'desktop.context.splitDiff')" @click="$emit('toggleLayout')" />
      <DesktopContextAction :icon="PanelRight20Regular" :label="t(treeVisible ? 'desktop.context.hideTree' : 'desktop.context.showTree')" :active="treeVisible" @click="$emit('toggleTree')" />
    </div>
  </div>
</template>

<style scoped>
.desktop-change-toolbar { display: flex; width: 100%; min-width: 0; align-items: center; gap: 10px; padding: 0 10px; }
.desktop-change-toolbar__range { display: flex; flex: none; gap: 2px; padding: 3px; border-radius: 7px; background: var(--buddy-surface-subtle); }
.desktop-change-toolbar__range button { border: 0; border-radius: 5px; background: transparent; color: var(--buddy-text-secondary); cursor: pointer; font-size: 12px; font-weight: 580; padding: 5px 8px; white-space: nowrap; }
.desktop-change-toolbar__range button.is-active { background: var(--buddy-surface-base); box-shadow: var(--buddy-shadow-soft); color: var(--buddy-text-strong); }
.desktop-change-toolbar__range button:disabled { opacity: 0.4; cursor: default; }
.desktop-change-toolbar__range button:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 1px; }
.desktop-change-toolbar__counts { display: flex; gap: 5px; font-family: var(--buddy-font-mono); font-size: 12px; white-space: nowrap; }
.is-added { color: var(--buddy-status-success-text); }
.is-deleted { color: var(--buddy-status-danger-text); }
.desktop-change-toolbar__actions { display: flex; flex: none; margin-left: auto; gap: 2px; }
</style>
