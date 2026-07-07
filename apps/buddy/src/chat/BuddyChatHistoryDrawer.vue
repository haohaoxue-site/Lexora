<script setup lang="ts">
import type { BuddyChatHistoryActionMenuItem } from '@/chat/BuddyChatHistoryActionMenu.vue'
import type {
  BuddyChatConversationListItem,
  BuddyChatProjectListItem,
  BuddyChatWorkspaceTarget,
} from '@/chat/buddyChatWorkspace'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Chat16Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Delete16Regular,
  Edit16Regular,
  Folder16Regular,
  FolderAdd16Regular,
} from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import BuddyChatConfirmDialog from '@/chat/BuddyChatConfirmDialog.vue'
import BuddyChatHistoryActionMenu from '@/chat/BuddyChatHistoryActionMenu.vue'
import { useBuddyChatHistoryDrawer } from '@/chat/useBuddyChatHistoryDrawer'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  globalConversationItems: ReadonlyArray<BuddyChatConversationListItem>
  isAddingProject: boolean
  language: BuddyLocale
  projectItems: ReadonlyArray<BuddyChatProjectListItem>
  show: boolean
  target: BuddyChatWorkspaceTarget
}>()

const emit = defineEmits<{
  'addProject': []
  'openGlobalDraft': []
  'openProjectDraft': [projectRoot: string]
  'openConversation': [conversationId: string]
  'deleteConversation': [conversationId: string]
  'update:show': [value: boolean]
}>()

const { t } = useBuddyI18n(() => props.language)
const deleteTarget = shallowRef<BuddyChatConversationListItem | null>(null)
const {
  currentProjectRoot,
  isExpanded,
  isSectionExpanded,
  resolveConversationMeta,
  toggleProject,
  toggleSection,
} = useBuddyChatHistoryDrawer({
  language: () => props.language,
  projectItems: () => props.projectItems,
  target: () => props.target,
})

const newConversationMenuItems = computed<ReadonlyArray<BuddyChatHistoryActionMenuItem>>(() => [
  {
    icon: Edit16Regular,
    key: 'new',
    label: t('chat.newConversation'),
  },
])

const sessionMenuItems = computed<ReadonlyArray<BuddyChatHistoryActionMenuItem>>(() => [
  {
    icon: Delete16Regular,
    key: 'delete',
    label: t('chat.deleteConversation'),
    tone: 'danger',
  },
])

function openProjectDraft(projectRoot: string) {
  emit('openProjectDraft', projectRoot)
  closeDrawer()
}

function openGlobalDraft() {
  emit('openGlobalDraft')
  closeDrawer()
}

function openContextDraft() {
  const projectRoot = currentProjectRoot.value
  if (projectRoot) {
    openProjectDraft(projectRoot)
    return
  }

  openGlobalDraft()
}

function openConversation(conversationId: string) {
  emit('openConversation', conversationId)
  closeDrawer()
}

function handleConversationKeydown(event: KeyboardEvent, conversationId: string) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return

  event.preventDefault()
  openConversation(conversationId)
}

function handleGlobalMenuSelect(key: string) {
  if (key === 'new')
    openGlobalDraft()
}

function handleProjectMenuSelect(key: string, projectRoot: string) {
  if (key === 'new')
    openProjectDraft(projectRoot)
}

function handleConversationMenuSelect(key: string, conversation: BuddyChatConversationListItem) {
  if (key === 'delete')
    deleteTarget.value = conversation
}

function cancelDeleteConversation() {
  deleteTarget.value = null
}

function confirmDeleteConversation() {
  const conversation = deleteTarget.value
  if (!conversation)
    return

  deleteTarget.value = null
  emit('deleteConversation', conversation.id)
}

function addProject() {
  emit('addProject')
}

function closeDrawer() {
  emit('update:show', false)
}
</script>

<template>
  <Transition name="buddy-history-drawer-slide">
    <aside
      v-show="show"
      class="buddy-history-drawer"
      :aria-hidden="!show"
      aria-label="对话历史"
    >
      <div class="buddy-history-drawer__actions">
        <button
          class="buddy-history-drawer__primary-action"
          type="button"
          @click="openContextDraft"
        >
          <span class="buddy-history-drawer__row-icon">
            <NIcon :component="Edit16Regular" />
          </span>
          <span class="buddy-history-drawer__session-title">{{ t('chat.newConversation') }}</span>
        </button>
      </div>

      <div class="buddy-history-drawer__section">
        <header class="buddy-history-drawer__section-head">
          <button
            class="buddy-history-drawer__section-toggle"
            data-section="conversations"
            type="button"
            :aria-expanded="isSectionExpanded('conversations')"
            @click="toggleSection('conversations')"
          >
            <span class="buddy-history-drawer__section-title">{{ t('chat.conversationsSection') }}</span>
            <span class="buddy-history-drawer__disclosure">
              <NIcon :component="isSectionExpanded('conversations') ? ChevronDown16Regular : ChevronRight16Regular" />
            </span>
          </button>
          <BuddyChatHistoryActionMenu
            class="buddy-history-drawer__section-menu"
            :items="newConversationMenuItems"
            :label="t('chat.moreActions')"
            @select="handleGlobalMenuSelect"
          />
        </header>

        <div
          v-if="isSectionExpanded('conversations')"
          class="buddy-history-drawer__session-list"
        >
          <div
            v-for="conversation in globalConversationItems"
            :key="conversation.id"
            class="buddy-history-drawer__session"
            :class="{
              'is-running': resolveConversationMeta(conversation) === 'running',
              'is-failed': resolveConversationMeta(conversation) === 'failed',
            }"
            role="button"
            tabindex="0"
            @click="openConversation(conversation.id)"
            @keydown="handleConversationKeydown($event, conversation.id)"
          >
            <span class="buddy-history-drawer__row-icon">
              <NIcon :component="Chat16Regular" />
            </span>
            <span class="buddy-history-drawer__session-title">{{ conversation.title }}</span>
            <span
              v-if="resolveConversationMeta(conversation) === 'running'"
              class="buddy-history-drawer__status-dot"
            />
            <span
              v-else-if="resolveConversationMeta(conversation) === 'failed'"
              class="buddy-history-drawer__status-dot is-failed"
            />
            <span
              v-else
              class="buddy-history-drawer__session-time"
            >
              {{ resolveConversationMeta(conversation) }}
            </span>
            <BuddyChatHistoryActionMenu
              v-if="resolveConversationMeta(conversation) !== 'running'"
              class="buddy-history-drawer__session-menu"
              :items="sessionMenuItems"
              :label="t('chat.moreActions')"
              @click.stop
              @select="handleConversationMenuSelect($event, conversation)"
            />
          </div>
        </div>
      </div>

      <div class="buddy-history-drawer__section">
        <header class="buddy-history-drawer__section-head is-actionable">
          <button
            class="buddy-history-drawer__section-toggle"
            data-section="projects"
            type="button"
            :aria-expanded="isSectionExpanded('projects')"
            @click="toggleSection('projects')"
          >
            <span class="buddy-history-drawer__section-title">{{ t('chat.projectsSection') }}</span>
            <span class="buddy-history-drawer__disclosure">
              <NIcon :component="isSectionExpanded('projects') ? ChevronDown16Regular : ChevronRight16Regular" />
            </span>
          </button>
          <button
            class="buddy-history-drawer__section-action"
            type="button"
            :aria-label="t('chat.addProject')"
            :disabled="isAddingProject"
            :title="t('chat.addProject')"
            @click.stop="addProject"
          >
            <NIcon :component="FolderAdd16Regular" />
          </button>
        </header>

        <div
          v-if="isSectionExpanded('projects')"
          class="buddy-history-drawer__project-list"
        >
          <div
            v-for="project in projectItems"
            :key="project.root"
            class="buddy-history-drawer__project"
          >
            <button
              class="buddy-history-drawer__project-main"
              type="button"
              @click="toggleProject(project.root)"
            >
              <span class="buddy-history-drawer__row-icon">
                <NIcon :component="Folder16Regular" />
              </span>
              <span class="buddy-history-drawer__project-name">{{ project.name }}</span>
            </button>
            <BuddyChatHistoryActionMenu
              class="buddy-history-drawer__project-menu"
              :items="newConversationMenuItems"
              :label="t('chat.moreActions')"
              @click.stop
              @select="handleProjectMenuSelect($event, project.root)"
            />

            <div
              v-if="isExpanded(project.root)"
              class="buddy-history-drawer__project-children"
            >
              <div
                v-for="conversation in project.conversations"
                :key="conversation.id"
                class="buddy-history-drawer__session"
                :class="{
                  'is-running': resolveConversationMeta(conversation) === 'running',
                  'is-failed': resolveConversationMeta(conversation) === 'failed',
                }"
                role="button"
                tabindex="0"
                @click="openConversation(conversation.id)"
                @keydown="handleConversationKeydown($event, conversation.id)"
              >
                <span class="buddy-history-drawer__row-icon">
                  <NIcon :component="Chat16Regular" />
                </span>
                <span class="buddy-history-drawer__session-title">{{ conversation.title }}</span>
                <span
                  v-if="resolveConversationMeta(conversation) === 'running'"
                  class="buddy-history-drawer__status-dot"
                />
                <span
                  v-else-if="resolveConversationMeta(conversation) === 'failed'"
                  class="buddy-history-drawer__status-dot is-failed"
                />
                <span
                  v-else
                  class="buddy-history-drawer__session-time"
                >
                  {{ resolveConversationMeta(conversation) }}
                </span>
                <BuddyChatHistoryActionMenu
                  v-if="resolveConversationMeta(conversation) !== 'running'"
                  class="buddy-history-drawer__session-menu"
                  :items="sessionMenuItems"
                  :label="t('chat.moreActions')"
                  @click.stop
                  @select="handleConversationMenuSelect($event, conversation)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <BuddyChatConfirmDialog
        :cancel-label="t('common.cancel')"
        :confirm-label="t('chat.deleteConversation')"
        :message="t('chat.deleteConversationConfirmMessage', { title: deleteTarget?.title ?? '' })"
        :show="deleteTarget !== null"
        :title="t('chat.deleteConversationConfirmTitle')"
        @cancel="cancelDeleteConversation"
        @confirm="confirmDeleteConversation"
      />
    </aside>
  </Transition>
</template>

<style scoped lang="scss">
.buddy-history-drawer {
  --buddy-history-action-edge: 7px;
  --buddy-history-action-slot: 48px;
  --buddy-history-hover-bg: rgb(220 244 248 / 34%);
  --buddy-history-hover-border: rgb(91 176 211 / 66%);

  position: absolute;
  z-index: 5;
  inset: 0 auto 0 0;
  display: grid;
  align-content: start;
  gap: 20px;
  width: var(--buddy-history-drawer-width, min(276px, 72vw));
  height: 100%;
  min-height: 0;
  overflow: hidden auto;
  border-right: 1px solid rgb(202 176 118 / 42%);
  background:
    radial-gradient(circle at 18% 6%, rgb(141 193 209 / 20%) 0 58px, transparent 96px),
    radial-gradient(circle at 86% 16%, rgb(244 206 128 / 26%) 0 2px, transparent 3px),
    radial-gradient(circle at 72% 34%, rgb(244 206 128 / 18%) 0 1px, transparent 2px),
    linear-gradient(180deg, rgb(255 253 245 / 80%) 0%, rgb(245 251 248 / 72%) 54%, rgb(250 247 238 / 76%) 100%),
    url('../assets/window/chat-body.webp') left center / auto 100% no-repeat;
  background-blend-mode: normal, normal, normal, normal, soft-light;
  backdrop-filter: blur(18px) saturate(1.08);
  box-shadow:
    18px 0 42px rgb(7 19 43 / 14%),
    inset -1px 0 0 rgb(255 255 255 / 64%),
    inset 0 1px 0 rgb(255 255 255 / 58%);
  isolation: isolate;
  -webkit-backdrop-filter: blur(18px) saturate(1.08);
  padding: 18px 16px 20px;
  scrollbar-color: rgb(150 177 176 / 58%) transparent;
  scrollbar-width: thin;
}

.buddy-history-drawer::before,
.buddy-history-drawer::after {
  position: absolute;
  content: "";
  pointer-events: none;
}

.buddy-history-drawer::before {
  z-index: 0;
  inset: 0;
  background:
    linear-gradient(115deg, rgb(255 255 255 / 54%) 0%, rgb(255 255 255 / 16%) 38%, transparent 62%),
    repeating-linear-gradient(
      115deg,
      rgb(191 162 103 / 0%) 0 24px,
      rgb(191 162 103 / 14%) 25px,
      rgb(191 162 103 / 0%) 26px 72px
    );
}

.buddy-history-drawer::after {
  z-index: 2;
  top: 0;
  right: -1px;
  bottom: 0;
  width: 1px;
  background:
    linear-gradient(180deg, rgb(255 233 178 / 82%) 0%, rgb(104 154 163 / 42%) 42%, rgb(255 233 178 / 62%) 100%);
}

.buddy-history-drawer__actions,
.buddy-history-drawer__section {
  position: relative;
  z-index: 1;
}

.buddy-history-drawer-slide-enter-active,
.buddy-history-drawer-slide-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.buddy-history-drawer-slide-enter-from,
.buddy-history-drawer-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.buddy-history-drawer__actions {
  display: grid;
  gap: 4px;
}

.buddy-history-drawer__section {
  display: grid;
  gap: 9px;
}

.buddy-history-drawer__section-head {
  position: relative;
}

.buddy-history-drawer__section-head:not(.is-actionable) .buddy-history-drawer__section-toggle {
  padding-right: 38px;
}

.buddy-history-drawer__section-head.is-actionable .buddy-history-drawer__section-toggle {
  padding-right: 38px;
}

.buddy-history-drawer__section-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--buddy-text-secondary) 58%, #a5b0aa);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  outline: none;
  padding: 0 8px;
  text-align: left;
  text-shadow: 0 1px 0 rgb(255 255 255 / 70%);
}

.buddy-history-drawer__section-action {
  position: absolute;
  top: 50%;
  right: 5px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 8px;
  background: rgb(255 255 255 / 44%);
  box-shadow: inset 0 0 0 1px rgb(197 168 106 / 20%);
  color: color-mix(in srgb, var(--buddy-text-secondary) 78%, #57737a);
  cursor: pointer;
  font-size: 16px;
  outline: none;
  padding: 0;
  transform: translateY(-50%);
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
}

.buddy-history-drawer__section-menu {
  position: absolute;
  top: 50%;
  right: 5px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 0.16s ease;
}

.buddy-history-drawer__section-head:hover .buddy-history-drawer__section-menu,
.buddy-history-drawer__section-head:focus-within .buddy-history-drawer__section-menu {
  opacity: 1;
  pointer-events: auto;
}

.buddy-history-drawer__section-action:disabled {
  cursor: default;
  opacity: 0.46;
}

.buddy-history-drawer__section-action:not(:disabled):hover,
.buddy-history-drawer__section-action:not(:disabled):focus-visible {
  background: rgb(255 255 255 / 78%);
  box-shadow:
    inset 0 0 0 1px rgb(91 176 211 / 34%),
    0 2px 8px rgb(7 19 43 / 8%);
  color: color-mix(in srgb, var(--buddy-accent-primary) 74%, var(--buddy-text-primary));
}

.buddy-history-drawer__section-toggle::after {
  height: 1px;
  flex: 1 1 auto;
  background:
    linear-gradient(90deg, rgb(197 168 106 / 44%) 0%, rgb(197 168 106 / 0%) 100%);
  content: "";
}

.buddy-history-drawer__disclosure {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--buddy-text-secondary) 72%, #6b7f83);
  font-size: 15px;
  opacity: 0.72;
  transition:
    color 0.16s ease,
    opacity 0.16s ease;
}

.buddy-history-drawer__section-head:hover .buddy-history-drawer__disclosure,
.buddy-history-drawer__section-toggle:focus-visible .buddy-history-drawer__disclosure {
  color: color-mix(in srgb, var(--buddy-accent-primary) 58%, var(--buddy-text-secondary));
  opacity: 1;
}

.buddy-history-drawer__section-title {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-history-drawer__project-list,
.buddy-history-drawer__session-list {
  display: grid;
  gap: 2px;
}

.buddy-history-drawer__project {
  position: relative;
  display: grid;
  gap: 4px;
}

.buddy-history-drawer__primary-action,
.buddy-history-drawer__project-main,
.buddy-history-drawer__session {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  padding: 7px 9px;
  text-align: left;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.buddy-history-drawer__primary-action {
  min-height: 36px;
  color: color-mix(in srgb, var(--buddy-text-primary) 88%, #0b3159);
  font-weight: inherit;
}

.buddy-history-drawer__primary-action:hover,
.buddy-history-drawer__project-main:hover,
.buddy-history-drawer__session:hover {
  border-color: var(--buddy-history-hover-border);
  background:
    linear-gradient(135deg, rgb(255 255 255 / 66%) 0%, var(--buddy-history-hover-bg) 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 68%),
    0 0 0 1px rgb(247 213 151 / 16%);
}

.buddy-history-drawer__project-main {
  position: relative;
  padding-right: calc(var(--buddy-history-action-slot) + 8px);
}

.buddy-history-drawer__row-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: rgb(255 255 255 / 38%);
  box-shadow: inset 0 0 0 1px rgb(197 168 106 / 24%);
  color: color-mix(in srgb, var(--buddy-accent-primary) 72%, #37506d);
}

.buddy-history-drawer__project-name,
.buddy-history-drawer__session-title {
  overflow: hidden;
  min-width: 0;
  flex: 1 1 auto;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-history-drawer__project-menu {
  position: absolute;
  top: 5px;
  right: 7px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.buddy-history-drawer__project:hover .buddy-history-drawer__project-menu,
.buddy-history-drawer__project:focus-within .buddy-history-drawer__project-menu {
  opacity: 1;
  pointer-events: auto;
}

.buddy-history-drawer__project-children {
  display: grid;
  gap: 2px;
  margin-left: 0;
  border-left: 0;
  padding-left: 0;
}

.buddy-history-drawer__session {
  position: relative;
  justify-content: space-between;
  padding-right: calc(var(--buddy-history-action-slot) + 8px);
}

.buddy-history-drawer__session-time {
  position: absolute;
  right: var(--buddy-history-action-edge);
  display: inline-grid;
  place-items: center end;
  width: var(--buddy-history-action-slot);
  color: var(--buddy-text-secondary);
  flex: 0 0 auto;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  transition: opacity 0.16s ease;
}

.buddy-history-drawer__status-dot {
  position: absolute;
  right: calc(var(--buddy-history-action-edge) + (26px - 8px) / 2);
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--buddy-accent-primary) 72%, white);
  pointer-events: none;
}

.buddy-history-drawer__status-dot.is-failed {
  background: color-mix(in srgb, var(--buddy-accent-danger) 86%, white);
}

.buddy-history-drawer__session-menu {
  position: absolute;
  top: 50%;
  right: var(--buddy-history-action-edge);
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 0.16s ease;
}

.buddy-history-drawer__session:hover .buddy-history-drawer__session-time,
.buddy-history-drawer__session:focus-within .buddy-history-drawer__session-time,
.buddy-history-drawer__session.is-failed:hover .buddy-history-drawer__status-dot,
.buddy-history-drawer__session.is-failed:focus-within .buddy-history-drawer__status-dot {
  opacity: 0;
}

.buddy-history-drawer__session.is-running:hover .buddy-history-drawer__status-dot,
.buddy-history-drawer__session.is-running:focus-within .buddy-history-drawer__status-dot {
  opacity: 1;
}

.buddy-history-drawer__session:hover .buddy-history-drawer__session-menu,
.buddy-history-drawer__session:focus-within .buddy-history-drawer__session-menu {
  opacity: 1;
  pointer-events: auto;
}
</style>
