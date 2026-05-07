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
  let lookupRequestId = 0

  function resetLookupState() {
    lookupRequestId += 1
    matchedUser.value = null
    lookupErrorMessage.value = ''
    isLookingUpUser.value = false
  }

  async function lookupUserByCode(userCode: string) {
    const requestId = ++lookupRequestId
    const normalizedUserCode = normalizeUserCodeQuery(userCode)

    matchedUser.value = null
    lookupErrorMessage.value = ''
    isLookingUpUser.value = false

    if (!normalizedUserCode) {
      return null
    }

    if (!isExactUserCodeQuery(normalizedUserCode)) {
      lookupErrorMessage.value = '请输入完整协作码'
      return null
    }

    isLookingUpUser.value = true

    try {
      const user = await findUserByCode(normalizedUserCode)

      if (requestId !== lookupRequestId) {
        return null
      }

      if (userStore.currentUser?.id === user.id) {
        lookupErrorMessage.value = options.selfTargetMessage ?? '不能选择自己'
        return null
      }

      matchedUser.value = user
      return user
    }
    catch (error) {
      if (requestId !== lookupRequestId) {
        return null
      }

      lookupErrorMessage.value = getRequestErrorDisplayMessage(error, '未找到用户')
      return null
    }
    finally {
      if (requestId === lookupRequestId) {
        isLookingUpUser.value = false
      }
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
