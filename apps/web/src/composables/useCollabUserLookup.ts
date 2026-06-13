import type { UserCollabIdentity } from '@haohaoxue/samepage-contracts'
import { isExactUserCodeQuery, normalizeUserCodeQuery } from '@haohaoxue/samepage-shared/user'
import { shallowRef } from 'vue'
import { findUserByCode } from '@/apis/user'
import { translate } from '@/i18n'
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
      lookupErrorMessage.value = translate('docs.collaboration.invalidUserCode')
      return null
    }

    isLookingUpUser.value = true

    try {
      const user = await findUserByCode(normalizedUserCode)

      if (requestId !== lookupRequestId) {
        return null
      }

      if (userStore.currentUser?.id === user.id) {
        lookupErrorMessage.value = options.selfTargetMessage ?? translate('docs.collaboration.selfTargetInvalid')
        return null
      }

      matchedUser.value = user
      return user
    }
    catch (error) {
      if (requestId !== lookupRequestId) {
        return null
      }

      lookupErrorMessage.value = getRequestErrorDisplayMessage(error, translate('docs.collaboration.userNotFound'))
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
