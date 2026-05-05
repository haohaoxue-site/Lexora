<script setup lang="ts">
import UserTable from './components/UserTable.vue'
import { useUsers } from './composables/useUsers'

const {
  errorMessage,
  getGovernanceSwitchValue,
  handleGovernanceSwitchChange,
  isLoading,
  isLoadingUsers,
  isGovernanceSwitchDisabled,
  keywordInput,
  registrationSwitches,
  savingGovernanceFields,
  shouldShowEmailServiceHint,
  submitSearch,
  totalUsers,
  toggleUserStatus,
  updateFilters,
  updateKeyword,
  updatePageNo,
  updatePageSize,
  updatingUserId,
  userQuery,
  users,
} = useUsers()
</script>

<template>
  <div v-loading="isLoading" class="admin-users flex-col gap-6">
    <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

    <ElCard shadow="never" class="border-border-a80">
      <div class="flex flex-col gap-4">
        <div>
          <h2 class="m-0 text-base font-bold text-main">
            注册开关
          </h2>
          <p class="mt-1.5 text-xs leading-6 text-secondary">
            控制新用户当前可用的注册方式。设置会立即生效，不影响已注册用户的登录与使用。
          </p>
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <label
            v-for="item in registrationSwitches"
            :key="item.key"
            class="admin-users__switch-card"
          >
            <div>
              <span class="block text-sm font-semibold text-main">{{ item.label }}</span>
              <p class="mt-1 text-xs leading-6 text-secondary">
                {{ item.description }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2.5">
              <ElTooltip
                v-if="shouldShowEmailServiceHint(item.key)"
                placement="top"
                effect="light"
                :show-after="150"
              >
                <template #content>
                  <div class="admin-users__switch-hint">
                    <p class="admin-users__switch-hint-text">
                      未启用发件服务，开启邮箱密码注册前请先前往邮件配置启用发件服务。
                    </p>
                    <RouterLink to="/admin/email" class="admin-users__switch-hint-link">
                      前往发件配置
                    </RouterLink>
                  </div>
                </template>
                <button
                  type="button"
                  class="admin-users__switch-hint-trigger"
                  @click.stop.prevent
                  @mousedown.stop.prevent
                >
                  <SvgIcon category="ui" icon="info" size="1rem" />
                </button>
              </ElTooltip>
              <ElSwitch
                :model-value="getGovernanceSwitchValue(item.key)"
                :disabled="isGovernanceSwitchDisabled(item.key)"
                :loading="savingGovernanceFields[item.key]"
                @change="handleGovernanceSwitchChange(item.key, $event)"
              />
            </div>
          </label>
        </div>
      </div>
    </ElCard>

    <UserTable
      :keyword="keywordInput"
      :loading="isLoadingUsers"
      :page-no="userQuery.pageNo"
      :page-size="userQuery.pageSize ?? 20"
      :role-filter="userQuery.role ?? null"
      :status-filter="userQuery.status ?? null"
      :total="totalUsers"
      :updating-user-id="updatingUserId"
      :users="users"
      @search="submitSearch"
      @update-filters="updateFilters"
      @update-keyword="updateKeyword"
      @update-page-no="updatePageNo"
      @update-page-size="updatePageSize"
      @toggle-status="toggleUserStatus"
    />
  </div>
</template>

<style scoped lang="scss">
.admin-users {
  &__switch-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.875rem;
    padding: 1rem;
    background: var(--brand-bg-surface);
  }

  &__switch-hint {
    max-width: 16rem;
  }

  &__switch-hint-text {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: 0.75rem;
    line-height: 1.6;
  }

  &__switch-hint-link {
    display: inline-flex;
    margin-top: 0.5rem;
    color: var(--brand-primary);
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      opacity: 0.8;
    }
  }

  &__switch-hint-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 999px;
    color: var(--brand-warning);
    background: color-mix(in srgb, var(--brand-warning) 12%, transparent);
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover {
      background: color-mix(in srgb, var(--brand-warning) 18%, transparent);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--brand-primary) 35%, transparent);
      outline-offset: 2px;
    }
  }
}
</style>
