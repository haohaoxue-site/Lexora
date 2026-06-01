import type { FormRules } from 'element-plus'
import type { CollaborationPasswordFormModel } from '../../typing'

export interface CollaborationPasswordFormProps {
  disabled: boolean
  password: string
  rules: FormRules<CollaborationPasswordFormModel>
}

export interface CollaborationPasswordFormEmits {
  'submit': []
  'update:password': [password: string]
}

export interface CollaborationPasswordFormExposed {
  validate: () => Promise<boolean> | undefined
}
