export interface CollaborationPasswordEditDialogProps {
  modelValue: boolean
  passwordLength: number
  validationErrors: string[]
  showValidation: boolean
  saving: boolean
  canSave: boolean
}

export interface CollaborationPasswordEditDialogEmits {
  'update:modelValue': [visible: boolean]
  'generate': []
  'submit': []
}
