<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import PagePanel from '@/layouts/panels/page-panel'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import AuthGovernancePanel from '../../components/auth-governance-panel'
import AdminPageHeader from '../../components/page-header'
import UserTable from '../../components/user-table'
import { useAdminAuthGovernance } from '../../composables/useAdminAuthGovernance'
import { useAdminUsers } from '../../composables/useAdminUsers'

const { errorMessage: usersErrorMessage, loadUsers } = useAdminUsers()
const { errorMessage: governanceErrorMessage, loadGovernance } = useAdminAuthGovernance()
const { t } = useI18n({ useScope: 'global' })

const isLoading = shallowRef(false)
const pageErrorMessage = shallowRef('')
const errorMessage = computed(() =>
  pageErrorMessage.value
  || usersErrorMessage.value
  || governanceErrorMessage.value,
)

onMounted(loadData)

async function loadData() {
  isLoading.value = true
  pageErrorMessage.value = ''
  usersErrorMessage.value = ''
  governanceErrorMessage.value = ''

  try {
    await Promise.all([
      loadUsers(),
      loadGovernance(),
    ])
  }
  catch (error) {
    pageErrorMessage.value = getRequestErrorDisplayMessage(error, t('admin.errors.loadUserManagement'))
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <PagePanel>
    <template #header>
      <AdminPageHeader :title="t('admin.pages.users')" />
    </template>

    <div v-loading="isLoading" class="admin-users min-h-full flex flex-col gap-6 bg-fill-lighter p-4 lg:p-6">
      <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

      <AuthGovernancePanel />
      <UserTable />
    </div>
  </PagePanel>
</template>
