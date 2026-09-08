export interface TaskSpaceInput {
  memoryScope: 'personal_and_space' | 'space_only'
  name: string
  primaryDirectory: TaskSpacePrimaryDirectoryInput | null
}

export interface TaskSpacePrimaryDirectoryInput {
  id: string | null
  root: string
}
