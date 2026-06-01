export interface CollaborationPasswordPanelProps {
  passwordEnabled: boolean
  passwordStateLabel: string
  passwordLength: number
  updating: boolean
}

export interface CollaborationPasswordPanelEmits {
  updatePasswordEnabled: [value: string | number | boolean]
  editPassword: []
}
