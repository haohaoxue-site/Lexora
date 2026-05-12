<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import SystemAdminPageHeader from '../components/SystemAdminPageHeader.vue'
import AuthGovernancePanel from './components/AuthGovernancePanel.vue'
import UserTable from './components/UserTable.vue'
import { useSystemAuthGovernance } from './composables/useSystemAuthGovernance'
import { useSystemUsers } from './composables/useSystemUsers'

const { errorMessage: usersErrorMessage, loadUsers } = useSystemUsers()
const { errorMessage: governanceErrorMessage, loadGovernance } = useSystemAuthGovernance()

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
    pageErrorMessage.value = getRequestErrorDisplayMessage(error, '加载用户管理数据失败')
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <PagePanel>
    <template #header>
      <SystemAdminPageHeader title="用户" />
    </template>

    <div v-loading="isLoading" class="admin-users min-h-full flex flex-col gap-6 bg-fill-lighter p-4 lg:p-6">
      <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

      <AuthGovernancePanel />
      <UserTable />
    </div>
  </PagePanel>
</template>
