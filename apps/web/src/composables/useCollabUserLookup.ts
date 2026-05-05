import type { UserCollabIdentity } from '@haohaoxue/samepage-contracts'
import { isExactUserCodeQuery, normalizeUserCodeQuery } from '@haohaoxue/samepage-shared'
import { shallowRef } from 'vue'
import { findUserByCode } from '@/apis/user'
import { useUserStore } from '@/stores/user'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

interface UseCollabUserLookupOptions {
  selfTargetMessage?: string
}

export function useCollabUserLookup(options: UseCollabUserLookupOptions = {}) {
  const userStore = useUserStore()
  const matchedUser = shallowRef<UserCollabIdentity | null>(null)
  const lookupErrorMessage = shallowRef('')
  const isLookingUpUser = shallowRef(false)

  function resetLookupState() {
    matchedUser.value = null
    lookupErrorMessage.value = ''
  }

  async function lookupUserByCode(userCode: string) {
    const normalizedUserCode = normalizeUserCodeQuery(userCode)

    matchedUser.value = null
    lookupErrorMessage.value = ''

    if (!isExactUserCodeQuery(normalizedUserCode)) {
      lookupErrorMessage.value = '未找到用户'
      return null
    }

    isLookingUpUser.value = true

    try {
      const user = await findUserByCode(normalizedUserCode)

      if (userStore.currentUser?.id === user.id) {
        lookupErrorMessage.value = options.selfTargetMessage ?? '不能选择自己'
        return null
      }

      matchedUser.value = user
      return user
    }
    catch (error) {
      lookupErrorMessage.value = getRequestErrorDisplayMessage(error, '未找到用户')
      return null
    }
    finally {
      isLookingUpUser.value = false
    }
  }

  return {
    isLookingUpUser,
    lookupErrorMessage,
    lookupUserByCode,
    matchedUser,
    resetLookupState,
  }
}
