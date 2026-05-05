/**
 * 创建空间对话框属性。
 */
export interface WorkspaceCreateDialogProps {
  /**
   * 提交中状态
   * @description 控制按钮 loading 与表单禁用。
   */
  isSubmitting: boolean
}

/**
 * 创建空间提交载荷。
 */
export interface WorkspaceCreateDialogSubmitPayload {
  /**
   * 名称
   * @description 创建团队空间的名称。
   */
  name: string
  /**
   * 描述
   * @description 为空时不写入。
   */
  description?: string
  /**
   * 图标文件
   * @description 为空时不上传团队图标。
   */
  iconFile: File | null
}

export interface WorkspaceCreateDialogEmits {
  submit: [payload: WorkspaceCreateDialogSubmitPayload]
}
