import type { TurnIntoBlockType } from '@/components/tiptap-editor'
import type { WorkspaceNavigationMeta } from '@/router/typing'
import 'axios'
import '@tiptap/core'
import 'vue-router'

declare module 'axios' {
  interface AxiosRequestConfig {
    withCookieAuth?: boolean
  }

  interface InternalAxiosRequestConfig {
    withCookieAuth?: boolean
    _retry?: boolean
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    /** 公开路由，无需登录即可访问 */
    public?: boolean
    /** 密码强制修改期间仍允许访问 */
    allowWhenPasswordChangeRequired?: boolean
    /** 工作区侧栏导航元数据 */
    workspaceNav?: WorkspaceNavigationMeta
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    samepageBlockCommands: {
      turnIntoBlock: (target: TurnIntoBlockType) => ReturnType
      indentBlock: () => ReturnType
      outdentBlock: () => ReturnType
      moveBlockUp: () => ReturnType
      moveBlockDown: () => ReturnType
      moveCurrentBlockTo: (targetBlockId: string, placement: 'before' | 'after') => ReturnType
      insertBlock: () => ReturnType
      deleteBlock: () => ReturnType
      duplicateBlock: () => ReturnType
      splitCurrentBlock: () => ReturnType
      mergeBlockBackward: () => ReturnType
    }
  }
}
