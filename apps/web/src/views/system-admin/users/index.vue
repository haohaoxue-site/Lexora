<script setup lang="ts">
import AuthGovernancePanel from './components/AuthGovernancePanel.vue'
import UserTable from './components/UserTable.vue'
import { useUsers } from './composables/useUsers'

const {
  authGovernanceCards,
  errorMessage,
  getGovernanceSwitchValue,
  governance,
  handleGovernanceSwitchChange,
  inviteCodeForm,
  isInviteCodeDialogVisible,
  isLoading,
  isLoadingUsers,
  isGovernanceSwitchDisabled,
  isSavingInviteCode,
  keywordInput,
  openInviteCodeDialog,
  savingGovernanceFields,
  shouldShowMissingInviteCodeWarning,
  shouldShowEmailServiceHint,
  submitSearch,
  totalUsers,
  toggleUserStatus,
  updateFilters,
  updateKeyword,
  updatePageNo,
  updatePageSize,
  updateInviteCode,
  updatingUserId,
  userQuery,
  users,
} = useUsers()
</script>

<template>
  <div v-loading="isLoading" class="admin-users flex-col gap-6">
    <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

    <AuthGovernancePanel
      v-model:invite-code-dialog-visible="isInviteCodeDialogVisible"
      v-model:invite-code="inviteCodeForm.inviteCode"
      :auth-governance-cards="authGovernanceCards"
      :governance="governance"
      :saving-governance-fields="savingGovernanceFields"
      :should-show-missing-invite-code-warning="shouldShowMissingInviteCodeWarning"
      :is-saving-invite-code="isSavingInviteCode"
      :get-governance-switch-value="getGovernanceSwitchValue"
      :is-governance-switch-disabled="isGovernanceSwitchDisabled"
      :should-show-email-service-hint="shouldShowEmailServiceHint"
      @update-governance-switch="handleGovernanceSwitchChange"
      @open-invite-code-dialog="openInviteCodeDialog"
      @update-invite-code="updateInviteCode"
    />

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
